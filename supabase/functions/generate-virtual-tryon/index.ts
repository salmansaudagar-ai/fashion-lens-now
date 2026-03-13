/**
 * Multi-Model Virtual Try-On Orchestrator
 *
 * Runs up to 4 VTO models in parallel, then uses Claude as an AI judge
 * to pick the best result.
 *
 * Models:
 *   1. CatVTON-FLUX (Colab) — SOTA FID 5.59, FLUX.1-Fill + LoRA, finetuneable
 *   2. IDM-VTON  (Colab)    — single person + garment, dual-UNet architecture
 *   3. Vertex AI (Google)    — virtual-try-on-001, fast cloud API
 *   4. Gemini VTO (Google)   — gemini-2.5-flash-image, prompt-driven, supports 3-image input
 *
 * Input body:
 *   fullBodyImage    — base64 data URL of full-body photo (required)
 *   selfieImage      — base64 data URL of selfie (optional, used by Gemini for face accuracy)
 *   outfitImageUrls  — array with one base64 data URL of the garment
 *   category         — "upper_body" | "lower_body" | "dresses"
 *   garmentDescription — text description of garment (optional)
 *   models           — which models to run: ["catvton-flux","idm-vton","vertex-ai","gemini-vto"]
 *                       defaults to all available
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
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// ── Google Cloud config ──────────────────────────────────────
const GCP_PROJECT_ID = "fynd-jio-impetus-non-prod";
const GCP_LOCATION = "us-central1";

// ── Helpers ──────────────────────────────────────────────────

function stripDataUrlPrefix(b64: string): string {
  return b64.includes(",") ? b64.split(",")[1].replace(/\s/g, "") : b64.replace(/\s/g, "");
}

function mimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:(image\/[^;]+);base64,/);
  return m ? m[1] : "image/jpeg";
}

/** Upload a base64 data-URL image to Supabase Storage and return a 1-hour signed URL */
async function uploadAndSign(
  supabase: any,
  dataUrl: string,
  name: string,
): Promise<string> {
  const raw = stripDataUrlPrefix(dataUrl);
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const mime = mimeFromDataUrl(dataUrl);
  const ext = mime === "image/png" ? "png" : "jpg";
  const path = `tmp-inputs/${name}-${Date.now()}.${ext}`;

  await supabase.storage.from("vto-images").upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });

  const { data } = await supabase.storage
    .from("vto-images")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}

// ── Model runners ────────────────────────────────────────────

interface ModelResult {
  model: string;
  imageBase64: string | null; // raw base64, no prefix
  error?: string;
  durationMs: number;
}

/** 1. IDM-VTON via Colab Gradio server */
async function runIdmVton(
  personUrl: string,
  garmentUrl: string,
  category: string,
  description: string,
): Promise<ModelResult> {
  const start = Date.now();
  const COLAB_URL = Deno.env.get("IDM_VTON_COLAB_URL");
  if (!COLAB_URL) return { model: "IDM-VTON", imageBase64: null, error: "IDM_VTON_COLAB_URL not set (run Colab notebook first)", durationMs: 0 };

  try {
    // Gradio v4+ uses two-step API: POST /gradio_api/call/<api_name> then GET the event stream
    const baseUrl = COLAB_URL.replace(/\/$/, "");
    const callUrl = `${baseUrl}/gradio_api/call/tryon`;
    console.log(`[IDM-VTON] Calling Colab (Gradio v4): ${callUrl}`);

    // Step 1: Submit the job
    const submitRes = await fetch(callUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [personUrl, garmentUrl, description || "clothing item"],
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      throw new Error(`Colab IDM-VTON submit ${submitRes.status}: ${err.substring(0, 300)}`);
    }

    const { event_id } = await submitRes.json();
    if (!event_id) throw new Error("No event_id returned from Gradio submit");

    // Step 2: Get result via SSE stream
    const resultRes = await fetch(`${callUrl}/${event_id}`);
    if (!resultRes.ok) {
      const err = await resultRes.text();
      throw new Error(`Colab IDM-VTON result ${resultRes.status}: ${err.substring(0, 300)}`);
    }

    // Parse SSE response — look for "event: complete" data line
    const sseText = await resultRes.text();
    const dataMatch = sseText.match(/event:\s*complete\ndata:\s*(.+)/);
    if (!dataMatch) throw new Error(`IDM-VTON: no complete event in SSE response: ${sseText.substring(0, 300)}`);

    const gradioResponse = JSON.parse(dataMatch[1]);
    const resultJson = JSON.parse(gradioResponse[0] ?? "{}");

    if (!resultJson.success) throw new Error(resultJson.error || "IDM-VTON failed");
    if (!resultJson.image_base64) throw new Error("No image in IDM-VTON response");

    return { model: "IDM-VTON", imageBase64: resultJson.image_base64, durationMs: Date.now() - start };
  } catch (e) {
    return { model: "IDM-VTON", imageBase64: null, error: String(e), durationMs: Date.now() - start };
  }
}

/** 2. CatVTON-FLUX via Colab Gradio server — SOTA virtual try-on */
async function runCatVtonFlux(
  personUrl: string,
  garmentUrl: string,
  category: string,
  description: string,
): Promise<ModelResult> {
  const start = Date.now();
  const COLAB_URL = Deno.env.get("CATVTON_COLAB_URL");
  if (!COLAB_URL) return { model: "CatVTON-FLUX", imageBase64: null, error: "CATVTON_COLAB_URL not set (run Colab notebook first)", durationMs: 0 };

  try {
    // Gradio v4+ uses two-step API: POST /gradio_api/call/<api_name> then GET the event stream
    const baseUrl = COLAB_URL.replace(/\/$/, "");
    const callUrl = `${baseUrl}/gradio_api/call/tryon`;
    console.log(`[CatVTON-FLUX] Calling Colab (Gradio v4): ${callUrl}`);

    // Step 1: Submit the job — same API as IDM-VTON: person_url, garment_url, cloth_type
    const submitRes = await fetch(callUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [personUrl, garmentUrl, category || "upper_body"],
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      throw new Error(`Colab CatVTON-FLUX submit ${submitRes.status}: ${err.substring(0, 300)}`);
    }

    const { event_id } = await submitRes.json();
    if (!event_id) throw new Error("No event_id returned from Gradio submit");

    // Step 2: Get result via SSE stream
    const resultRes = await fetch(`${callUrl}/${event_id}`);
    if (!resultRes.ok) {
      const err = await resultRes.text();
      throw new Error(`Colab CatVTON-FLUX result ${resultRes.status}: ${err.substring(0, 300)}`);
    }

    // Parse SSE response — look for "event: complete" data line
    const sseText = await resultRes.text();
    const dataMatch = sseText.match(/event:\s*complete\ndata:\s*(.+)/);
    if (!dataMatch) throw new Error(`CatVTON-FLUX: no complete event in SSE response: ${sseText.substring(0, 300)}`);

    const gradioResponse = JSON.parse(dataMatch[1]);
    const resultJson = JSON.parse(gradioResponse[0] ?? "{}");

    if (!resultJson.success) throw new Error(resultJson.error || "CatVTON-FLUX failed");
    if (!resultJson.image_base64) throw new Error("No image in CatVTON-FLUX response");

    return { model: "CatVTON-FLUX", imageBase64: resultJson.image_base64, durationMs: Date.now() - start };
  } catch (e) {
    return { model: "CatVTON-FLUX", imageBase64: null, error: String(e), durationMs: Date.now() - start };
  }
}

/** 3. Google Vertex AI virtual-try-on-001 */
async function runVertexAI(
  personBase64: string,
  garmentBase64: string,
): Promise<ModelResult> {
  const start = Date.now();
  const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
  if (!saJson) return { model: "Vertex AI", imageBase64: null, error: "GCP service account not configured", durationMs: 0 };

  try {
    // Get access token via JWT
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

    // Call Vertex AI
    const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/virtual-try-on-001:predict`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{
          personImage: { image: { bytesBase64Encoded: personBase64 } },
          productImages: [{ image: { bytesBase64Encoded: garmentBase64 } }],
        }],
        parameters: { sampleCount: 1, outputOptions: { mimeType: "image/jpeg" } },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error("RATE_LIMIT");
      throw new Error(`Vertex AI ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const resultB64 =
      data.predictions?.[0]?.generatedImages?.[0]?.image?.bytesBase64Encoded ??
      data.predictions?.[0]?.image?.bytesBase64Encoded ??
      data.predictions?.[0]?.bytesBase64Encoded;
    if (!resultB64) throw new Error("No image in Vertex response");

    return { model: "Vertex AI", imageBase64: resultB64, durationMs: Date.now() - start };
  } catch (e) {
    return { model: "Vertex AI", imageBase64: null, error: String(e), durationMs: Date.now() - start };
  }
}

/** 4. Gemini 2.5 Flash Image — prompt-driven VTO with 3-image support */
async function runGeminiVTO(
  personBase64: string,
  garmentBase64: string,
  garmentDescription: string,
  category: string,
  selfieBase64?: string,
): Promise<ModelResult> {
  const start = Date.now();
  const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
  if (!saJson) return { model: "Gemini VTO", imageBase64: null, error: "GCP service account not configured", durationMs: 0 };

  try {
    // Get access token via JWT (same pattern as runVertexAI)
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

    // Build prompt based on available images
    const categoryLabel = category === "upper_body" ? "upper body top/shirt" :
      category === "lower_body" ? "lower body pants/skirt" : "full dress/outfit";

    let prompt: string;
    const parts: any[] = [];

    if (selfieBase64) {
      // 3-image flow: selfie (face) + full-body (body type) + garment
      prompt = `Virtual try-on task: Generate a photorealistic FULL BODY photo of a person wearing a new garment.

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
- Output a single photorealistic image`;

      parts.push({ text: prompt });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: selfieBase64 } });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
    } else {
      // 2-image flow: full-body + garment
      prompt = `Virtual try-on task: Generate a photorealistic FULL BODY photo of this person wearing the garment shown.

INPUTS:
- Image 1 (PERSON): The person to dress. Preserve their face, skin tone, hair, body type, and proportions exactly.
- Image 2 (GARMENT): The ${categoryLabel} to put on the person. Description: ${garmentDescription || "clothing item"}.

REQUIREMENTS:
- Output must be a full-body standing photo from head to toe
- Face and identity must be perfectly preserved (no alterations)
- The garment must be accurately rendered with correct colors, patterns, and natural fit
- Keep other clothing items not being replaced
- Professional fashion catalog quality, neutral background, even lighting
- Output a single photorealistic image`;

      parts.push({ text: prompt });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
    }

    // Call Gemini 2.5 Flash Image
    const MODEL = "gemini-2.5-flash-image";
    const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${MODEL}:generateContent`;
    console.log(`[Gemini VTO] Calling ${MODEL} with ${selfieBase64 ? "3" : "2"} images`);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
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

    console.log(`[Gemini VTO] Success in ${Date.now() - start}ms`);
    return { model: "Gemini VTO", imageBase64: resultB64, durationMs: Date.now() - start };
  } catch (e) {
    return { model: "Gemini VTO", imageBase64: null, error: String(e), durationMs: Date.now() - start };
  }
}

// ── AI Judge (Claude) ────────────────────────────────────────

async function judgeResults(
  results: ModelResult[],
  personBase64: string,
  garmentBase64: string,
): Promise<{ winner: string; reasoning: string; scores: Record<string, number> }> {
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  const successful = results.filter((r) => r.imageBase64);
  if (successful.length === 0) return { winner: "", reasoning: "No models produced results", scores: {} };
  if (successful.length === 1)
    return {
      winner: successful[0].model,
      reasoning: `Only ${successful[0].model} produced a result (${successful[0].durationMs}ms).`,
      scores: { [successful[0].model]: 40 },
    };

  // If no Anthropic key, pick the fastest successful model
  if (!ANTHROPIC_KEY) {
    const fastest = successful.reduce((a, b) => (a.durationMs < b.durationMs ? a : b));
    return {
      winner: fastest.model,
      reasoning: `No AI judge configured — selected fastest: ${fastest.model} (${fastest.durationMs}ms).`,
      scores: Object.fromEntries(successful.map((r) => [r.model, 0])),
    };
  }

  try {
    // Build Claude message with images
    const content: any[] = [];

    content.push({ type: "text", text: "ORIGINAL PERSON:" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: personBase64 },
    });

    content.push({ type: "text", text: "TARGET GARMENT:" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: garmentBase64 },
    });

    for (let i = 0; i < successful.length; i++) {
      content.push({
        type: "text",
        text: `RESULT ${i + 1} — ${successful[i].model} (${successful[i].durationMs}ms):`,
      });
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: successful[i].imageBase64! },
      });
    }

    content.push({
      type: "text",
      text: `You are a fashion AI quality evaluator. Compare the virtual try-on results.
Score each (1-10) on: IDENTITY (face/skin/hair match), GARMENT (color/pattern accuracy), FIT (natural proportions), REALISM (photo quality).
Respond ONLY with valid JSON: {"winner":"model name","scores":{"Model Name":30},"reasoning":"one sentence"}`,
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        winner: parsed.winner || successful[0].model,
        reasoning: parsed.reasoning || "",
        scores: parsed.scores || {},
      };
    }
    throw new Error("No JSON in Claude response");
  } catch (e) {
    console.error("Judge error:", e);
    // Fallback: pick first result
    return {
      winner: successful[0].model,
      reasoning: `Judge failed (${e}), defaulting to ${successful[0].model}.`,
      scores: {},
    };
  }
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
      models: requestedModels,
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

    console.log(`[VTO] Session ${session.id} — starting multi-model generation`);

    // Upload images to Supabase Storage for URL-based APIs (fal.ai)
    console.log("[VTO] Uploading images to storage...");
    const [fullBodyUrl, garmentUrl, selfieUrl] = await Promise.all([
      uploadAndSign(supabase, fullBodyImage, `person-${session.id}`),
      uploadAndSign(supabase, garmentDataUrl, `garment-${session.id}`),
      selfieImage ? uploadAndSign(supabase, selfieImage, `selfie-${session.id}`) : Promise.resolve(""),
    ]);
    console.log("[VTO] Images uploaded, URLs ready");

    // Raw base64 for Vertex AI and Gemini (they use direct base64, not URLs)
    const personRawB64 = stripDataUrlPrefix(fullBodyImage);
    const garmentRawB64 = stripDataUrlPrefix(garmentDataUrl);
    const selfieRawB64 = selfieImage ? stripDataUrlPrefix(selfieImage) : undefined;

    // Determine which models to run based on available Colab URLs / API keys
    const hasCatVtonFlux = !!Deno.env.get("CATVTON_COLAB_URL");
    const hasIdmVton = !!Deno.env.get("IDM_VTON_COLAB_URL");
    const hasGcpKey = !!Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");

    const enabledModels = requestedModels ?? [
      ...(hasCatVtonFlux ? ["catvton-flux"] : []),
      ...(hasIdmVton ? ["idm-vton"] : []),
      ...(hasGcpKey ? ["vertex-ai", "gemini-vto"] : []),
    ];

    console.log(`[VTO] Running models: ${enabledModels.join(", ")}`);

    // Signal the display screen
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/update-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, updates: { registration_status: "generating" } }),
      });
    } catch (_) { /* non-critical */ }

    // Run all models in parallel
    const modelPromises: Promise<ModelResult>[] = [];

    if (enabledModels.includes("catvton-flux")) {
      modelPromises.push(runCatVtonFlux(fullBodyUrl, garmentUrl, category, garmentDescription));
    }
    if (enabledModels.includes("idm-vton")) {
      modelPromises.push(runIdmVton(fullBodyUrl, garmentUrl, category, garmentDescription));
    }
    if (enabledModels.includes("vertex-ai")) {
      modelPromises.push(runVertexAI(personRawB64, garmentRawB64));
    }
    if (enabledModels.includes("gemini-vto")) {
      modelPromises.push(runGeminiVTO(personRawB64, garmentRawB64, garmentDescription, category, selfieRawB64));
    }

    if (modelPromises.length === 0) {
      return new Response(
        JSON.stringify({ error: "No models available. Set CATVTON_COLAB_URL, IDM_VTON_COLAB_URL, or GCP credentials." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const modelResults = await Promise.all(modelPromises);

    // Log results
    for (const r of modelResults) {
      if (r.error) console.log(`[VTO] ${r.model}: FAILED — ${r.error}`);
      else console.log(`[VTO] ${r.model}: OK (${r.durationMs}ms)`);
    }

    const successfulResults = modelResults.filter((r) => r.imageBase64);
    if (successfulResults.length === 0) {
      const errors = modelResults.map((r) => `${r.model}: ${r.error}`).join("; ");
      return new Response(
        JSON.stringify({ error: `All models failed: ${errors}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // AI Judge picks the best
    console.log(`[VTO] Judging ${successfulResults.length} result(s)...`);
    const judgeResult = await judgeResults(successfulResults, personRawB64, garmentRawB64);
    console.log(`[VTO] Winner: ${judgeResult.winner} — ${judgeResult.reasoning}`);

    // Get winner image
    const winnerResult =
      successfulResults.find((r) => r.model === judgeResult.winner) ?? successfulResults[0];

    // Upload ALL successful model images to storage (for comparison page)
    const ts = Date.now();
    const modelImageUploads = await Promise.all(
      successfulResults.map(async (r) => {
        const slug = r.model.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const bytes = Uint8Array.from(atob(r.imageBase64!), (c) => c.charCodeAt(0));
        const path = `generated-looks/${slug}-${session.id}-${ts}.jpg`;

        await supabase.storage.from("vto-images").upload(path, bytes, {
          contentType: "image/jpeg",
          upsert: true,
        });

        const { data } = await supabase.storage
          .from("vto-images")
          .createSignedUrl(path, 86400);

        return { model: r.model, imageUrl: data?.signedUrl ?? null };
      }),
    );

    // Winner URL
    const winnerUpload = modelImageUploads.find((u) => u.model === winnerResult.model);
    const winnerImageUrl = winnerUpload?.imageUrl;
    if (!winnerImageUrl) throw new Error("Failed to create winner image URL");

    // Build model comparison data for the /compare page
    const modelComparisonData = {
      modelResults: modelResults.map((r) => {
        const upload = modelImageUploads.find((u) => u.model === r.model);
        return {
          model: r.model,
          success: !!r.imageBase64,
          error: r.error || null,
          durationMs: r.durationMs,
          imageUrl: upload?.imageUrl ?? null,
        };
      }),
      winner: judgeResult.winner,
      reasoning: judgeResult.reasoning,
      scores: judgeResult.scores,
      generatedAt: new Date().toISOString(),
    };

    // Atomically update session: generation count, generated_look_url, garment_url,
    // model_comparison_data, and registration_status — all in one DB write.
    // This fixes the race condition where /display saw status='registered' before
    // generated_look_url was set.
    await supabase
      .from("vto_sessions")
      .update({
        generation_count: session.generation_count + 1,
        generated_look_url: winnerImageUrl,
        garment_url: garmentUrl,
        model_comparison_data: modelComparisonData,
        registration_status: "registered",
      })
      .eq("id", session.id);

    console.log(`[VTO] Done! Winner: ${judgeResult.winner}, count: ${session.generation_count + 1}`);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: winnerImageUrl,
        winner: judgeResult.winner,
        reasoning: judgeResult.reasoning,
        scores: judgeResult.scores,
        modelResults: modelResults.map((r) => {
          const upload = modelImageUploads.find((u) => u.model === r.model);
          return {
            model: r.model,
            success: !!r.imageBase64,
            error: r.error,
            durationMs: r.durationMs,
            imageUrl: upload?.imageUrl ?? null,
          };
        }),
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
