/**
 * Virtual Try-On — Gemini 2.5 Flash Image
 *
 * Uses Google's gemini-2.5-flash-image model via generateContent API.
 * Supports 2 flows:
 *   - 2-image: fullBodyImage + garment → try-on
 *   - 3-image: selfieImage (face) + fullBodyImage (body) + garment → try-on
 *
 * Input body:
 *   fullBodyImage      — base64 data URL of full-body photo (required)
 *   selfieImage        — base64 data URL of selfie (optional, improves face accuracy)
 *   outfitImageUrls    — array with one base64 data URL of the garment
 *   category           — "upper_body" | "lower_body" | "dresses"
 *   garmentDescription — text description of garment (optional)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
};

const MAX_GENERATIONS_PER_SESSION = 10;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ── Google Cloud config ──────────────────────────────────────
const GCP_PROJECT_ID = "fynd-jio-impetus-non-prod";
const GCP_LOCATION = "us-central1";
const GEMINI_MODEL = "gemini-2.5-flash-image";

// ── Helpers ──────────────────────────────────────────────────

function stripDataUrlPrefix(b64: string): string {
  return b64.includes(",") ? b64.split(",")[1].replace(/\s/g, "") : b64.replace(/\s/g, "");
}

function mimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:(image\/[^;]+);base64,/);
  return m ? m[1] : "image/jpeg";
}

/** Cached GCP access token — survives across warm invocations (~50min TTL) */
let _cachedToken: { token: string; expiresAt: number } | null = null;

/** Get GCP access token via JWT-signed service account credentials (cached) */
async function getGcpAccessToken(saJson: string): Promise<string> {
  // Return cached token if still valid (with 5-min safety margin)
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) return _cachedToken.token;
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encode({ alg: "RS256", typ: "JWT" });
  const payloadB64 = encode({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemKey = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----\n?/, "")
    .replace(/\n?-----END PRIVATE KEY-----\n?/, "")
    .replace(/\n/g, "");
  const keyBytes = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${sigB64}`,
    }),
  });
  if (!tokenRes.ok) throw new Error(`GCP token error: ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json();
  // Cache for 50 minutes (tokens valid for 60min, 10min safety margin)
  _cachedToken = { token: access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return access_token;
}

// ── Gemini Body Measurements ─────────────────────────────────

async function extractMeasurements(
  personBase64: string,
  accessToken: string,
  supabase?: any,
): Promise<Record<string, any>> {
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const defaultMeasurePrompt = `Analyze this full-body photo and estimate the person's body measurements and recommended clothing size.

TASK: Provide approximate body measurements based on visual analysis of this full-body standing photo.

OUTPUT FORMAT: Respond with ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "height_cm": <estimated height in cm>,
  "shoulder_width_cm": <shoulder width in cm>,
  "chest_cm": <chest circumference in cm>,
  "waist_cm": <waist circumference in cm>,
  "hip_cm": <hip circumference in cm>,
  "arm_length_cm": <arm length in cm>,
  "inseam_cm": <inseam length in cm>,
  "build": "<slim|average|athletic|broad>",
  "recommended_size": "<XS|S|M|L|XL|XXL>",
  "confidence": "<low|medium|high>"
}

Important: These are approximate visual estimates. Base them on proportions visible in the photo. If the person appears average height (170cm for men, 160cm for women), use that as a reference point.`;

  const measurePrompt = supabase ? await fetchPrompt(supabase, "measurements", defaultMeasurePrompt) : defaultMeasurePrompt;

  const parts = [
    { text: measurePrompt },
    { inlineData: { mimeType: "image/jpeg", data: personBase64 } },
  ];

  console.log("[Measurements] Calling Gemini for body analysis...");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    console.error(`[Measurements] Gemini error: ${res.status}`);
    return {};
  }

  const data = await res.json();
  const textParts = data.candidates?.[0]?.content?.parts ?? [];
  let rawText = "";
  for (const p of textParts) {
    if (p.text) { rawText += p.text; }
  }

  // Parse JSON from response (strip markdown code fences if present)
  try {
    const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const measurements = JSON.parse(jsonStr);
    console.log("[Measurements] Extracted:", JSON.stringify(measurements));
    return measurements;
  } catch (e) {
    console.error("[Measurements] Parse error:", e, "Raw:", rawText.substring(0, 200));
    return {};
  }
}

// ── Fetch dynamic prompts from DB ─────────────────────────────

async function fetchPrompt(supabase: any, key: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase.from("vto_prompts").select("prompt").eq("key", key).single();
    if (data?.prompt) return data.prompt;
  } catch (e) {
    console.warn(`[Prompt] Failed to fetch prompt '${key}', using fallback`);
  }
  return fallback;
}

// ── Gemini VTO ───────────────────────────────────────────────

async function runGeminiVTO(
  personBase64: string,
  garmentBase64: string,
  garmentDescription: string,
  category: string,
  accessToken: string,
  selfieBase64?: string,
  supabase?: any,
): Promise<{ imageBase64: string; durationMs: number }> {
  const start = Date.now();

  // Build prompt based on available images
  const categoryLabel = category === "upper_body" ? "upper body top/shirt" :
    category === "lower_body" ? "lower body pants/skirt" : "full dress/outfit";

  const descSuffix = garmentDescription ? `Description: ${garmentDescription}.` : "";

  const parts: any[] = [];

  if (selfieBase64) {
    // 3-image flow: selfie (face) + full-body (body type) + garment
    const defaultPrompt3 = `You are a professional virtual try-on system. Replace ONLY the {categoryLabel} on the person with the garment shown, producing a photorealistic result.

CRITICAL FACE PRESERVATION RULES:
- The person's face must be an EXACT pixel-level copy from Image 1. Do NOT regenerate, smooth, stylize, or "enhance" the face in any way.
- Preserve every facial detail: skin texture, pores, blemishes, moles, wrinkles, facial hair, exact eye shape and color, nose shape, lip shape and color, eyebrow shape.
- Preserve exact skin tone — do NOT lighten, darken, or change the hue of the skin.
- Preserve exact hair: style, color, texture, flyaways. Do NOT restyle, smooth, or change hair.
- If the person wears glasses, preserve them exactly.
- The face should look like an untouched photograph, NOT like a rendered/AI image.

INPUTS:
- Image 1 (SELFIE): The person's face reference — copy this face EXACTLY as-is.
- Image 2 (FULL BODY): The person's body — use for body shape, height, posture, stance.
- Image 3 (GARMENT): The {categoryLabel} to dress the person in. {garmentDescription}

OUTPUT RULES:
- Full-body standing photo, head to toe
- ONLY replace the {categoryLabel} — keep all other clothing, accessories, shoes unchanged from Image 2
- Garment must have correct colors, patterns, fabric texture, logos, and natural draping/fit on this body
- Natural studio lighting, clean background
- Output one photorealistic image`;
    const rawPrompt = supabase ? await fetchPrompt(supabase, "vto_3image", defaultPrompt3) : defaultPrompt3;
    const promptText = rawPrompt
      .replace(/\{categoryLabel\}/g, categoryLabel)
      .replace(/\{garmentDescription\}/g, descSuffix);
    parts.push({ text: promptText });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: selfieBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
  } else {
    // 2-image flow: full-body + garment
    const defaultPrompt2 = `You are a professional virtual try-on system. Replace ONLY the {categoryLabel} on the person with the garment shown, producing a photorealistic result.

CRITICAL FACE PRESERVATION RULES:
- The person's face must be an EXACT copy from the input photo. Do NOT regenerate, smooth, stylize, or "enhance" the face.
- Preserve every facial detail: skin texture, pores, blemishes, moles, wrinkles, facial hair, exact eye shape and color.
- Preserve exact skin tone — do NOT lighten, darken, or change skin color.
- Preserve exact hair: style, color, texture. Do NOT restyle or smooth hair.
- The face should look like an untouched photograph, NOT an AI rendering.

INPUTS:
- Image 1 (PERSON): The person wearing their current clothes. Copy their face and identity EXACTLY.
- Image 2 (GARMENT): The {categoryLabel} to dress the person in. {garmentDescription}

OUTPUT RULES:
- Full-body standing photo, head to toe
- ONLY replace the {categoryLabel} — keep all other clothing, accessories, shoes unchanged
- Garment must have correct colors, patterns, fabric texture, and natural draping/fit
- Natural studio lighting, clean background
- Output one photorealistic image`;
    const rawPrompt = supabase ? await fetchPrompt(supabase, "vto_2image", defaultPrompt2) : defaultPrompt2;
    const promptText = rawPrompt
      .replace(/\{categoryLabel\}/g, categoryLabel)
      .replace(/\{garmentDescription\}/g, descSuffix);
    parts.push({ text: promptText });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
  }

  // Call Gemini 2.5 Flash Image
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
  console.log(`[Gemini VTO] Calling ${GEMINI_MODEL} with ${selfieBase64 ? "3" : "2"} images`);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  const candidates = data.candidates ?? [];
  if (candidates.length === 0) throw new Error("No candidates in Gemini response");

  // Extract the generated image from response parts
  const responseParts = candidates[0]?.content?.parts ?? [];
  let resultB64: string | null = null;
  for (const part of responseParts) {
    if (part.inlineData?.data) {
      resultB64 = part.inlineData.data;
      break;
    }
  }

  if (!resultB64) throw new Error("No image in Gemini response");

  const durationMs = Date.now() - start;
  console.log(`[Gemini VTO] Success in ${durationMs}ms`);
  return { imageBase64: resultB64, durationMs };
}

// ── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sessionToken = req.headers.get("x-session-token");
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "Session token required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from("vto_sessions")
      .select("id, created_at, generation_count")
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Date.now() - new Date(session.created_at).getTime() > SESSION_EXPIRY_MS) {
      return new Response(JSON.stringify({ error: "Session expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (session.generation_count >= MAX_GENERATIONS_PER_SESSION) {
      return new Response(JSON.stringify({ error: "Generation limit reached (max 10)." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const {
      fullBodyImage,
      selfieImage,
      outfitImageUrls,
      category = "upper_body",
      garmentDescription = "clothing item",
    } = body;

    if (!fullBodyImage || !fullBodyImage.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Valid full body image required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const garmentDataUrl = Array.isArray(outfitImageUrls) ? outfitImageUrls[0] : null;
    if (!garmentDataUrl || !garmentDataUrl.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Valid garment image required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[VTO] Session ${session.id} — starting Gemini VTO generation`);

    // Signal the display screen
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/update-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, updates: { registration_status: "generating" } }),
      });
    } catch (_) { /* non-critical */ }

    // Strip base64 prefixes for Gemini (it uses raw base64)
    const personRawB64 = stripDataUrlPrefix(fullBodyImage);
    const garmentRawB64 = stripDataUrlPrefix(garmentDataUrl);
    const selfieRawB64 = selfieImage ? stripDataUrlPrefix(selfieImage) : undefined;

    // Get GCP access token ONCE and reuse for both VTO and measurements
    const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GCP service account not configured");
    const accessToken = await getGcpAccessToken(saJson);

    // Run Gemini VTO and measurements IN PARALLEL to save time
    const vtoPromise = runGeminiVTO(personRawB64, garmentRawB64, garmentDescription, category, accessToken, selfieRawB64, supabase);
    const measurePromise = extractMeasurements(personRawB64, accessToken, supabase).catch((e) => {
      console.error("[VTO] Measurement extraction failed:", e);
      return {} as Record<string, any>;
    });

    const [result, measurements] = await Promise.all([vtoPromise, measurePromise]);

    // ── Upload result + garment images in PARALLEL ─────────────
    const ts = Date.now();
    const bytes = Uint8Array.from(atob(result.imageBase64), (c) => c.charCodeAt(0));
    const path = `generated-looks/gemini-vto-${session.id}-${ts}.jpg`;
    const garmentMime = mimeFromDataUrl(garmentDataUrl);
    const garmentExt = garmentMime === "image/png" ? "png" : "jpg";
    const garmentPath = `tmp-inputs/garment-${session.id}-${ts}.${garmentExt}`;
    const garmentBytes = Uint8Array.from(atob(stripDataUrlPrefix(garmentDataUrl)), (c) => c.charCodeAt(0));

    // Parallel: upload both images simultaneously
    const [resultUpload, garmentUpload] = await Promise.all([
      supabase.storage.from("vto-images").upload(path, bytes, { contentType: "image/jpeg", upsert: true }),
      supabase.storage.from("vto-images").upload(garmentPath, garmentBytes, { contentType: garmentMime, upsert: true }),
    ]);

    // Parallel: get signed URLs for both
    const [resultSignedRes, garmentSignedRes] = await Promise.all([
      supabase.storage.from("vto-images").createSignedUrl(path, 86400),
      supabase.storage.from("vto-images").createSignedUrl(garmentPath, 86400),
    ]);
    const imageUrl = resultSignedRes.data?.signedUrl;
    if (!imageUrl) throw new Error("Failed to create image URL");
    const garmentUrl = garmentSignedRes.data?.signedUrl ?? "";

    // ── Save training data in PARALLEL (non-blocking) ────────
    // Fire-and-forget: don't block the response
    const trainId = `${session.id}-${ts}`;
    const personTrainPath = `training-data/${trainId}-person.jpg`;
    const garmentTrainPath = `training-data/${trainId}-garment.jpg`;
    const resultTrainPath = `training-data/${trainId}-result.jpg`;
    const selfieTrainPath = selfieRawB64 ? `training-data/${trainId}-selfie.jpg` : null;

    // Build all training upload promises
    const trainUploads: Promise<any>[] = [
      supabase.storage.from("vto-images").upload(personTrainPath, Uint8Array.from(atob(personRawB64), (c) => c.charCodeAt(0)), { contentType: "image/jpeg", upsert: true }),
      supabase.storage.from("vto-images").upload(garmentTrainPath, garmentBytes, { contentType: garmentMime, upsert: true }),
      supabase.storage.from("vto-images").upload(resultTrainPath, bytes, { contentType: "image/jpeg", upsert: true }),
    ];
    if (selfieRawB64 && selfieTrainPath) {
      trainUploads.push(supabase.storage.from("vto-images").upload(selfieTrainPath, Uint8Array.from(atob(selfieRawB64), (c) => c.charCodeAt(0)), { contentType: "image/jpeg", upsert: true }));
    }

    // Run all training uploads in parallel, then insert metadata
    Promise.all(trainUploads)
      .then(() => supabase.from("vto_training_data").insert({
        session_id: session.id,
        person_image_path: personTrainPath,
        garment_image_path: garmentTrainPath,
        selfie_image_path: selfieTrainPath,
        result_image_path: resultTrainPath,
        category,
        garment_description: garmentDescription,
        gemini_duration_ms: result.durationMs,
      }))
      .then(() => console.log(`[VTO] Training data saved: ${trainId}`))
      .catch(e => console.error("[VTO] Training data save failed:", e));

    // Build model comparison data (single model, kept for backward compat with /compare page)
    const modelComparisonData = {
      modelResults: [{
        model: "Gemini VTO",
        success: true,
        error: null,
        durationMs: result.durationMs,
        imageUrl,
      }],
      winner: "Gemini VTO",
      reasoning: `Gemini VTO completed in ${(result.durationMs / 1000).toFixed(1)}s.`,
      scores: { "Gemini VTO": 40 },
      generatedAt: new Date().toISOString(),
    };

    // Update session in one atomic write (include measurements)
    await supabase
      .from("vto_sessions")
      .update({
        generation_count: session.generation_count + 1,
        generated_look_url: imageUrl,
        garment_url: garmentUrl,
        model_comparison_data: modelComparisonData,
        body_measurements: Object.keys(measurements).length > 0 ? measurements : null,
        registration_status: "registered",
      })
      .eq("id", session.id);

    console.log(`[VTO] Done! Gemini VTO ${result.durationMs}ms, measurements: ${Object.keys(measurements).length > 0 ? 'yes' : 'no'}, count: ${session.generation_count + 1}`);

    // Video generation is triggered separately by the frontend via /generate-video

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        winner: "Gemini VTO",
        reasoning: `Generated in ${(result.durationMs / 1000).toFixed(1)}s`,
        scores: { "Gemini VTO": 40 },
        modelResults: [{
          model: "Gemini VTO",
          success: true,
          durationMs: result.durationMs,
          imageUrl,
        }],
        measurements,
        videoGenerating: true,
        generationsRemaining: MAX_GENERATIONS_PER_SESSION - session.generation_count - 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[VTO] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
