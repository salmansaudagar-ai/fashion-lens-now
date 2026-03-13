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

/** Get GCP access token via JWT-signed service account credentials */
async function getGcpAccessToken(saJson: string): Promise<string> {
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
  return access_token;
}

// ── Gemini Body Measurements ─────────────────────────────────

async function extractMeasurements(
  personBase64: string,
  accessToken: string,
): Promise<Record<string, any>> {
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const parts = [
    { text: `Analyze this full-body photo and estimate the person's body measurements and recommended clothing size.

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

Important: These are approximate visual estimates. Base them on proportions visible in the photo. If the person appears average height (170cm for men, 160cm for women), use that as a reference point.` },
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

// ── Gemini VTO ───────────────────────────────────────────────

async function runGeminiVTO(
  personBase64: string,
  garmentBase64: string,
  garmentDescription: string,
  category: string,
  selfieBase64?: string,
): Promise<{ imageBase64: string; durationMs: number }> {
  const start = Date.now();
  const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
  if (!saJson) throw new Error("GCP service account not configured");

  const accessToken = await getGcpAccessToken(saJson);

  // Build prompt based on available images
  const categoryLabel = category === "upper_body" ? "upper body top/shirt" :
    category === "lower_body" ? "lower body pants/skirt" : "full dress/outfit";

  const parts: any[] = [];

  if (selfieBase64) {
    // 3-image flow: selfie (face) + full-body (body type) + garment
    parts.push({ text: `Virtual try-on task: Generate a photorealistic FULL BODY photo of a person wearing a new garment.

INPUTS:
- Image 1 (SELFIE): Use this for the person's FACE — exact facial features, skin tone, hair style, glasses, expressions. The face must be identical.
- Image 2 (FULL BODY): Use this for the person's BODY TYPE — height, proportions, build, posture, stance. The body shape must match.
- Image 3 (GARMENT): This is the ${categoryLabel} to put on the person. Description: ${garmentDescription || "clothing item"}.

REQUIREMENTS:
- The output must be a full-body standing photo from head to toe
- Face from Image 1 must be preserved exactly (no alterations to facial features, skin tone, or hair)
- Body proportions from Image 2 must be maintained
- The garment from Image 3 must be accurately rendered with correct colors, patterns, and fit
- Keep all other clothing items from Image 2 that are not being replaced
- Professional fashion catalog quality, neutral background, even lighting
- Output a single photorealistic image` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: selfieBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
  } else {
    // 2-image flow: full-body + garment
    parts.push({ text: `Virtual try-on task: Generate a photorealistic FULL BODY photo of this person wearing the garment shown.

INPUTS:
- Image 1 (PERSON): The person to dress. Preserve their face, skin tone, hair, body type, and proportions exactly.
- Image 2 (GARMENT): The ${categoryLabel} to put on the person. Description: ${garmentDescription || "clothing item"}.

REQUIREMENTS:
- Output must be a full-body standing photo from head to toe
- Face and identity must be perfectly preserved (no alterations)
- The garment must be accurately rendered with correct colors, patterns, and natural fit
- Keep other clothing items not being replaced
- Professional fashion catalog quality, neutral background, even lighting
- Output a single photorealistic image` });
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
        temperature: 0.4,
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

    // Run Gemini VTO
    const result = await runGeminiVTO(personRawB64, garmentRawB64, garmentDescription, category, selfieRawB64);

    // ── Extract body measurements (parallel-safe, non-blocking) ──
    let measurements: Record<string, any> = {};
    try {
      const saJsonForMeasure = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
      if (saJsonForMeasure) {
        const measureToken = await getGcpAccessToken(saJsonForMeasure);
        measurements = await extractMeasurements(personRawB64, measureToken);
      }
    } catch (measureErr) {
      console.error("[VTO] Measurement extraction failed:", measureErr);
    }

    // Upload generated image to storage
    const bytes = Uint8Array.from(atob(result.imageBase64), (c) => c.charCodeAt(0));
    const path = `generated-looks/gemini-vto-${session.id}-${Date.now()}.jpg`;

    await supabase.storage.from("vto-images").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

    const { data: signedUrlData } = await supabase.storage
      .from("vto-images")
      .createSignedUrl(path, 86400);
    const imageUrl = signedUrlData?.signedUrl;
    if (!imageUrl) throw new Error("Failed to create image URL");

    // Upload garment URL for display
    const garmentMime = mimeFromDataUrl(garmentDataUrl);
    const garmentExt = garmentMime === "image/png" ? "png" : "jpg";
    const garmentPath = `tmp-inputs/garment-${session.id}-${Date.now()}.${garmentExt}`;
    const garmentBytes = Uint8Array.from(atob(stripDataUrlPrefix(garmentDataUrl)), (c) => c.charCodeAt(0));
    await supabase.storage.from("vto-images").upload(garmentPath, garmentBytes, {
      contentType: garmentMime,
      upsert: true,
    });
    const { data: garmentSignedData } = await supabase.storage
      .from("vto-images")
      .createSignedUrl(garmentPath, 86400);
    const garmentUrl = garmentSignedData?.signedUrl ?? "";

    // ── Save training data for CatVTON-FLUX fine-tuning ──────
    // Every successful Gemini generation becomes a training triplet:
    //   (person, garment, [selfie]) → gemini_result
    // Stored in vto-images/training-data/ with permanent paths (no signed URLs)
    try {
      const ts = Date.now();
      const trainId = `${session.id}-${ts}`;

      // Upload person image for training
      const personTrainPath = `training-data/${trainId}-person.jpg`;
      const personTrainBytes = Uint8Array.from(atob(personRawB64), (c) => c.charCodeAt(0));
      await supabase.storage.from("vto-images").upload(personTrainPath, personTrainBytes, {
        contentType: "image/jpeg", upsert: true,
      });

      // Upload garment image for training
      const garmentTrainPath = `training-data/${trainId}-garment.jpg`;
      await supabase.storage.from("vto-images").upload(garmentTrainPath, garmentBytes, {
        contentType: garmentMime, upsert: true,
      });

      // Upload result image for training (this is the Gemini output = ground truth)
      const resultTrainPath = `training-data/${trainId}-result.jpg`;
      await supabase.storage.from("vto-images").upload(resultTrainPath, bytes, {
        contentType: "image/jpeg", upsert: true,
      });

      // Upload selfie if present
      let selfieTrainPath: string | null = null;
      if (selfieRawB64) {
        selfieTrainPath = `training-data/${trainId}-selfie.jpg`;
        const selfieBytes = Uint8Array.from(atob(selfieRawB64), (c) => c.charCodeAt(0));
        await supabase.storage.from("vto-images").upload(selfieTrainPath, selfieBytes, {
          contentType: "image/jpeg", upsert: true,
        });
      }

      // Record metadata in vto_training_data table
      await supabase.from("vto_training_data").insert({
        session_id: session.id,
        person_image_path: personTrainPath,
        garment_image_path: garmentTrainPath,
        selfie_image_path: selfieTrainPath,
        result_image_path: resultTrainPath,
        category,
        garment_description: garmentDescription,
        gemini_duration_ms: result.durationMs,
      });

      console.log(`[VTO] Training data saved: ${trainId}`);
    } catch (trainErr) {
      // Non-critical — don't fail the request if training data save fails
      console.error("[VTO] Training data save failed:", trainErr);
    }

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
