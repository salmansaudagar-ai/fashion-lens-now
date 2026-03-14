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

// ── Customer Profile Detection ──────────────────────────────

interface CustomerProfile {
  gender: string;
  age_range: string;
  skin_tone: string;
  skin_undertone: string;
  body_type: string;
  hair: string;
  distinctive_features: string;
  ethnicity_region: string;
}

const DEFAULT_PROFILE: CustomerProfile = {
  gender: "unknown",
  age_range: "25-35",
  skin_tone: "medium-brown",
  skin_undertone: "warm",
  body_type: "average",
  hair: "dark",
  distinctive_features: "none",
  ethnicity_region: "south-asian",
};

async function detectCustomerProfile(
  imageBase64: string,
  accessToken: string,
  supabase?: any,
): Promise<CustomerProfile> {
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const defaultProfilePrompt = `Analyze this photo and extract the following attributes about this person. Respond with ONLY a JSON object, no markdown or explanation.

{
  "gender": "<male|female>",
  "age_range": "<18-25|25-35|35-45|45-55|55+>",
  "skin_tone": "<very-fair|fair|light-brown|medium-brown|dark-brown|very-dark>",
  "skin_undertone": "<warm|cool|neutral>",
  "body_type": "<slim|average|athletic|broad|curvy|plus>",
  "hair": "<short|medium|long> <dark|brown|light|grey|colored>",
  "distinctive_features": "<comma-separated list: glasses, beard, moustache, nose ring, bindi, etc. or none>",
  "ethnicity_region": "<south-asian|southeast-asian|east-asian|middle-eastern|african|caucasian|mixed>"
}

Be accurate and respectful. Base judgments only on visible features.`;

  const profilePrompt = supabase ? await fetchAdaptivePrompt(supabase, "profile_detect", defaultProfilePrompt) : defaultProfilePrompt;

  try {
    console.log("[Profile] Detecting customer profile...");
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: profilePrompt },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        ]}],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      console.warn(`[Profile] Gemini error: ${res.status}, using defaults`);
      return DEFAULT_PROFILE;
    }

    const data = await res.json();
    const textParts = data.candidates?.[0]?.content?.parts ?? [];
    let rawText = "";
    for (const p of textParts) { if (p.text) rawText += p.text; }

    const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const profile = JSON.parse(jsonStr) as CustomerProfile;
    console.log("[Profile] Detected:", JSON.stringify(profile));
    return { ...DEFAULT_PROFILE, ...profile };
  } catch (e) {
    console.error("[Profile] Detection failed:", e);
    return DEFAULT_PROFILE;
  }
}

// ── Gemini Body Measurements (gender-aware) ─────────────────

async function extractMeasurements(
  personBase64: string,
  accessToken: string,
  profile: CustomerProfile,
  supabase?: any,
): Promise<Record<string, any>> {
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  // Use gender-specific measurement prompt
  const promptKey = profile.gender === "female" ? "measurements_female" : "measurements_male";
  const defaultMeasurePrompt = `Analyze this full-body photo and estimate the person's body measurements and recommended clothing size for an Indian retail store.

OUTPUT FORMAT: Respond with ONLY a JSON object (no markdown, no explanation):
{
  "height_cm": <estimated height, use ${profile.gender === "female" ? "152" : "166"} as Indian ${profile.gender} baseline>,
  "shoulder_width_cm": <shoulder width>,
  "chest_cm": <chest circumference>,
  "waist_cm": <waist circumference>,
  "waist_inches": <waist in inches>,
  "hip_cm": <hip circumference>,
  "arm_length_cm": <arm length>,
  "inseam_cm": <inseam length>,
  "build": "<slim|average|athletic|broad${profile.gender === "female" ? "|curvy" : ""}>",
  "recommended_size": "<XS|S|M|L|XL|XXL> based on Indian sizing",
  "recommended_trouser": "<26|28|30|32|34|36|38|40> waist in inches",
  "confidence": "<low|medium|high>"
}`;

  const measurePrompt = supabase ? await fetchAdaptivePrompt(supabase, promptKey, defaultMeasurePrompt) : defaultMeasurePrompt;

  console.log(`[Measurements] Using ${promptKey} prompt for ${profile.gender} customer`);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: measurePrompt },
        { inlineData: { mimeType: "image/jpeg", data: personBase64 } },
      ]}],
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
  for (const p of textParts) { if (p.text) rawText += p.text; }

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

// ── Fetch adaptive prompts from DB (with A/B versioning) ────

interface PromptSelection { prompt: string; version: string; promptKey: string; }

async function fetchAdaptivePrompt(supabase: any, key: string, fallback: string): Promise<string> {
  // First try versioned prompts (vto_prompt_versions table)
  try {
    const { data: versions } = await supabase
      .from("vto_prompt_versions")
      .select("version, prompt, traffic_weight")
      .eq("prompt_key", key)
      .eq("is_active", true);

    if (versions && versions.length > 0) {
      // Weighted random selection for A/B testing
      const totalWeight = versions.reduce((sum: number, v: any) => sum + (v.traffic_weight || 50), 0);
      let rand = Math.random() * totalWeight;
      for (const v of versions) {
        rand -= (v.traffic_weight || 50);
        if (rand <= 0) return v.prompt;
      }
      return versions[0].prompt;
    }
  } catch (e) {
    console.warn(`[Prompt] Failed to fetch versioned prompt '${key}'`);
  }

  // Fallback to legacy vto_prompts table
  try {
    const { data } = await supabase.from("vto_prompts").select("prompt").eq("key", key).single();
    if (data?.prompt) return data.prompt;
  } catch (e) {
    console.warn(`[Prompt] Failed to fetch legacy prompt '${key}', using fallback`);
  }
  return fallback;
}

async function fetchAdaptivePromptWithMeta(supabase: any, key: string, fallback: string): Promise<PromptSelection> {
  try {
    const { data: versions } = await supabase
      .from("vto_prompt_versions")
      .select("version, prompt, traffic_weight")
      .eq("prompt_key", key)
      .eq("is_active", true);

    if (versions && versions.length > 0) {
      const totalWeight = versions.reduce((sum: number, v: any) => sum + (v.traffic_weight || 50), 0);
      let rand = Math.random() * totalWeight;
      for (const v of versions) {
        rand -= (v.traffic_weight || 50);
        if (rand <= 0) return { prompt: v.prompt, version: v.version, promptKey: key };
      }
      return { prompt: versions[0].prompt, version: versions[0].version, promptKey: key };
    }
  } catch (e) { /* fallthrough */ }

  try {
    const { data } = await supabase.from("vto_prompts").select("prompt").eq("key", key).single();
    if (data?.prompt) return { prompt: data.prompt, version: "legacy", promptKey: key };
  } catch (e) { /* fallthrough */ }

  return { prompt: fallback, version: "default", promptKey: key };
}

/** Interpolate profile variables into prompt template */
function interpolatePrompt(template: string, profile: CustomerProfile, extras: Record<string, string> = {}): string {
  let result = template;
  for (const [key, value] of Object.entries(profile)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  for (const [key, value] of Object.entries(extras)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ── Legacy prompt fetch (backward compat) ────────────────────

async function fetchPrompt(supabase: any, key: string, fallback: string): Promise<string> {
  return fetchAdaptivePrompt(supabase, key, fallback);
}

// ── Gemini VTO ───────────────────────────────────────────────

async function runGeminiVTO(
  personBase64: string,
  garmentBase64: string,
  garmentDescription: string,
  category: string,
  accessToken: string,
  profile: CustomerProfile,
  selfieBase64?: string,
  supabase?: any,
): Promise<{ imageBase64: string; durationMs: number; promptVersion: string; promptKey: string }> {
  const start = Date.now();

  const categoryLabel = category === "upper_body" ? "upper body top/shirt" :
    category === "lower_body" ? "lower body pants/skirt" : "full dress/outfit";
  const descSuffix = garmentDescription ? `Description: ${garmentDescription}.` : "";

  // Select the right prompt key based on category (adaptive)
  let promptKey = "vto_western_upper"; // default
  if (category === "lower_body") promptKey = "vto_western_lower";
  else if (category === "dresses") promptKey = "vto_ethnic";
  // TODO: detect ethnic vs western from garment description in the future

  const parts: any[] = [];

  // Try to fetch adaptive prompt, fallback to legacy
  const { prompt: adaptivePrompt, version: promptVersion, promptKey: usedKey } = supabase
    ? await fetchAdaptivePromptWithMeta(supabase, promptKey, "")
    : { prompt: "", version: "default", promptKey };

  if (adaptivePrompt && selfieBase64) {
    // Adaptive 3-image flow with profile variables
    const promptText = interpolatePrompt(adaptivePrompt, profile, {
      categoryLabel, garmentDescription: descSuffix,
    });
    parts.push({ text: promptText });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: selfieBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
    console.log(`[Gemini VTO] Using adaptive prompt: ${usedKey} ${promptVersion}`);
  } else if (adaptivePrompt) {
    // Adaptive 2-image flow
    const promptText = interpolatePrompt(adaptivePrompt, profile, {
      categoryLabel, garmentDescription: descSuffix,
    });
    parts.push({ text: promptText });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
    console.log(`[Gemini VTO] Using adaptive prompt: ${usedKey} ${promptVersion} (2-image)`);
  } else if (selfieBase64) {
    // Legacy 3-image fallback
    const defaultPrompt3 = `You are a professional virtual try-on system. Replace ONLY the ${categoryLabel} on the person with the garment shown, producing a photorealistic result.

CRITICAL FACE PRESERVATION RULES:
- The person's face must be an EXACT pixel-level copy from Image 1. Do NOT regenerate, smooth, stylize, or "enhance" the face.
- Preserve every facial detail: skin texture, pores, blemishes, moles, wrinkles, facial hair, exact eye shape and color.
- Preserve exact skin tone — do NOT lighten, darken, or change the hue of the skin.
- Preserve exact hair: style, color, texture, flyaways.
- The face should look like an untouched photograph, NOT an AI rendering.

INPUTS:
- Image 1 (SELFIE): The person's face reference — copy EXACTLY.
- Image 2 (FULL BODY): The person's body shape, posture, stance.
- Image 3 (GARMENT): The ${categoryLabel} to dress them in. ${descSuffix}

OUTPUT: Full-body photo, head to toe. ONLY replace the ${categoryLabel}. Photorealistic.`;
    const rawPrompt = supabase ? await fetchPrompt(supabase, "vto_3image", defaultPrompt3) : defaultPrompt3;
    parts.push({ text: rawPrompt });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: selfieBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
  } else {
    // Legacy 2-image fallback
    const defaultPrompt2 = `You are a professional virtual try-on system. Replace ONLY the ${categoryLabel} on the person with the garment shown, producing a photorealistic result.

CRITICAL RULES:
- Face must be an EXACT copy. Do NOT alter the face.
- Preserve exact skin tone, hair, and all details.

INPUTS:
- Image 1 (PERSON): Current photo. Copy face and identity EXACTLY.
- Image 2 (GARMENT): The ${categoryLabel} to dress them in. ${descSuffix}

OUTPUT: Full-body photo, head to toe. ONLY replace ${categoryLabel}. Photorealistic.`;
    const rawPrompt = supabase ? await fetchPrompt(supabase, "vto_2image", defaultPrompt2) : defaultPrompt2;
    parts.push({ text: rawPrompt });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: personBase64 } });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: garmentBase64 } });
  }

  // Call Gemini 2.5 Flash Image (with retry on "no image" failures)
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const temperature = attempt === 0 ? 0.2 : 0.4 + attempt * 0.1;
    console.log(`[Gemini VTO] Attempt ${attempt + 1}/${MAX_RETRIES + 1} — ${GEMINI_MODEL}, ${selfieBase64 ? "3" : "2"} images, temp=${temperature}`);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          temperature,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (attempt < MAX_RETRIES) {
        console.warn(`[Gemini VTO] Attempt ${attempt + 1} failed (${res.status}), retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`Gemini ${res.status}: ${err.substring(0, 300)}`);
    }

    const data = await res.json();
    const candidates = data.candidates ?? [];
    if (candidates.length === 0) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Gemini VTO] Attempt ${attempt + 1}: no candidates, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error("No candidates in Gemini response after retries");
    }

    const responseParts = candidates[0]?.content?.parts ?? [];
    let resultB64: string | null = null;
    for (const part of responseParts) {
      if (part.inlineData?.data) {
        resultB64 = part.inlineData.data;
        break;
      }
    }

    if (!resultB64) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Gemini VTO] Attempt ${attempt + 1}: no image in response, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error("No image in Gemini response after retries");
    }

    const durationMs = Date.now() - start;
    console.log(`[Gemini VTO] Success in ${durationMs}ms (attempt ${attempt + 1})`);
    return { imageBase64: resultB64, durationMs, promptVersion: promptVersion ?? "default", promptKey: usedKey ?? promptKey };
  }

  throw new Error("Gemini VTO failed after all retries");
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
      .select("id, created_at, generation_count, customer_profile")
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

    // Clear old video URL and signal display screen that generation is in progress
    // This ensures the tablet's video polling doesn't find a stale video from previous generation
    try {
      await supabase
        .from("vto_sessions")
        .update({ registration_status: "generating", generated_video_url: null })
        .eq("id", session.id);
    } catch (_) { /* non-critical */ }

    // Strip base64 prefixes for Gemini (it uses raw base64)
    const personRawB64 = stripDataUrlPrefix(fullBodyImage);
    const garmentRawB64 = stripDataUrlPrefix(garmentDataUrl);
    const selfieRawB64 = selfieImage ? stripDataUrlPrefix(selfieImage) : undefined;

    // Get GCP access token ONCE and reuse for all Gemini calls
    const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GCP service account not configured");
    const accessToken = await getGcpAccessToken(saJson);

    // ── Customer profile detection (reuse from session if already done) ──
    let profile: CustomerProfile;
    if (session.customer_profile && typeof session.customer_profile === "object" && session.customer_profile.gender) {
      profile = session.customer_profile as CustomerProfile;
      console.log(`[VTO] Reusing existing profile: ${profile.gender}, ${profile.skin_tone}`);
    } else {
      const profileImage = selfieRawB64 || personRawB64;
      profile = await detectCustomerProfile(profileImage, accessToken, supabase);
      console.log(`[VTO] Detected new profile: ${profile.gender}, ${profile.skin_tone}, ${profile.body_type}`);
    }

    // Run Gemini VTO and measurements IN PARALLEL to save time
    const vtoPromise = runGeminiVTO(personRawB64, garmentRawB64, garmentDescription, category, accessToken, profile, selfieRawB64, supabase);
    const measurePromise = extractMeasurements(personRawB64, accessToken, profile, supabase).catch((e) => {
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

    // Use public URLs (bucket is public — no expiration)
    const { data: resultPublic } = supabase.storage.from("vto-images").getPublicUrl(path);
    const { data: garmentPublic } = supabase.storage.from("vto-images").getPublicUrl(garmentPath);
    const imageUrl = resultPublic?.publicUrl;
    if (!imageUrl) throw new Error("Failed to create image URL");
    const garmentUrl = garmentPublic?.publicUrl ?? "";

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

    // Update session in one atomic write (include measurements + profile + prompt version)
    await supabase
      .from("vto_sessions")
      .update({
        generation_count: session.generation_count + 1,
        generated_look_url: imageUrl,
        garment_url: garmentUrl,
        model_comparison_data: modelComparisonData,
        body_measurements: Object.keys(measurements).length > 0 ? measurements : null,
        registration_status: "registered",
        customer_profile: profile,
        prompt_version: result.promptVersion ? `${result.promptKey}:${result.promptVersion}` : null,
      })
      .eq("id", session.id);

    // Also insert into vto_generations for per-garment tracking in dashboard
    supabase
      .from("vto_generations")
      .insert({
        session_id: session.id,
        garment_url: garmentUrl,
        garment_description: garmentDescription,
        category,
        generated_look_url: imageUrl,
        body_measurements: Object.keys(measurements).length > 0 ? measurements : null,
        customer_profile: profile,
        prompt_version: result.promptVersion ? `${result.promptKey}:${result.promptVersion}` : null,
        duration_ms: result.durationMs,
      })
      .then(({ error: genErr }) => {
        if (genErr) console.error("[VTO] Failed to insert generation row:", genErr);
        else console.log("[VTO] Generation row inserted for dashboard tracking");
      });

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
        customerProfile: profile,
        promptVersion: result.promptVersion ? `${result.promptKey}:${result.promptVersion}` : null,
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
