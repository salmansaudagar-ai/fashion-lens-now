// No background removal — pass original image directly to Vertex AI
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};

const MAX_GENERATIONS_PER_SESSION = 10;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const GCP_PROJECT_ID = "fynd-jio-impetus-non-prod";
const GCP_LOCATION = "us-central1";
const VERTEX_AI_MODEL = "virtual-try-on-001";

// Get Google Cloud access token from service account JSON using JWT
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the private key
  const pemKey = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----\n?/, "")
    .replace(/\n?-----END PRIVATE KEY-----\n?/, "")
    .replace(/\n/g, "");

  const keyBytes = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signingInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Convert base64 data URL to raw base64 string
function extractBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  return { mimeType: match[1], base64: match[2] };
}

// Call Vertex AI Virtual Try-On API — one product image per request
async function applyClothingItem(
  accessToken: string,
  personImageBase64: string,
  productImageBase64: string
): Promise<string> {
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${VERTEX_AI_MODEL}:predict`;

  const stripPrefix = (b64: string) => b64.includes(",") ? b64.split(",")[1].replace(/\s/g, "") : b64.replace(/\s/g, "");
  const cleanPersonBase64 = stripPrefix(personImageBase64);
  const cleanProductBase64 = stripPrefix(productImageBase64);

  console.log(`Request: person base64 length=${cleanPersonBase64.length}, product base64 length=${cleanProductBase64.length}`);

  const requestBody = {
    instances: [
      {
        personImage: {
          image: { bytesBase64Encoded: cleanPersonBase64 },
        },
        productImages: [
          {
            image: { bytesBase64Encoded: cleanProductBase64 },
          },
        ],
      },
    ],
    parameters: {
      sampleCount: 1,
      outputOptions: { mimeType: "image/jpeg" },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Vertex AI API error:", response.status, errorText);
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 403) throw new Error("AUTH_ERROR");
    throw new Error(`Vertex AI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const resultBase64 = data.predictions?.[0]?.generatedImages?.[0]?.image?.bytesBase64Encoded
    ?? data.predictions?.[0]?.image?.bytesBase64Encoded
    ?? data.predictions?.[0]?.bytesBase64Encoded;
  if (!resultBase64) {
    console.error("No image in Vertex AI response:", JSON.stringify(data).substring(0, 500));
    throw new Error("No image returned from Vertex AI");
  }

  return resultBase64;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get session token from headers
    const sessionToken = req.headers.get("x-session-token");
    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: "Session token required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for session validation
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify session exists and is valid
    const { data: session, error: sessionError } = await supabase
      .from("vto_sessions")
      .select("id, created_at, generation_count")
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      console.error("Session validation error:", sessionError);
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check session age (expire after 24 hours)
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > SESSION_EXPIRY_MS) {
      return new Response(
        JSON.stringify({ error: "Session expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit
    if (session.generation_count >= MAX_GENERATIONS_PER_SESSION) {
      return new Response(
        JSON.stringify({ error: "Generation limit reached for this session. Maximum 10 generations allowed." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fullBodyImage, outfitImageUrls } = await req.json();

    // Validate required fields
    if (!fullBodyImage) {
      return new Response(
        JSON.stringify({ error: "Full body image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!fullBodyImage.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "Invalid full body image format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fullBodyImage.length > MAX_IMAGE_SIZE) {
      return new Response(
        JSON.stringify({ error: "Full body image too large. Maximum 10MB allowed." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!outfitImageUrls || !Array.isArray(outfitImageUrls) || outfitImageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one outfit image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Cloud access token
    const serviceAccountJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON is not configured");
    }

    console.log("Getting Google Cloud access token...");
    const accessToken = await getGoogleAccessToken(serviceAccountJson);
    console.log("Access token obtained");

    // Extract person image
    const personImg = extractBase64(fullBodyImage);

    // Filter valid outfit images
    const validOutfitUrls = outfitImageUrls.filter(
      (url: string) => url && url.startsWith("data:image/")
    );

    if (validOutfitUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid outfit images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating virtual try-on for session: ${session.id}`);
    console.log(`Applying ${validOutfitUrls.length} clothing item(s) sequentially (1 per API call)`);

    // Sequential try-on: apply each clothing item one at a time
    // The API only accepts exactly 1 productImage per request
    let currentPersonBase64 = personImg.base64;
    for (let i = 0; i < validOutfitUrls.length; i++) {
      const outfitImg = extractBase64(validOutfitUrls[i]);
      console.log(`Applying clothing item ${i + 1}/${validOutfitUrls.length}...`);
      try {
        currentPersonBase64 = await applyClothingItem(
          accessToken,
          currentPersonBase64,
          outfitImg.base64
        );
        console.log(`Clothing item ${i + 1} applied successfully`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg === "RATE_LIMIT") {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (errMsg === "AUTH_ERROR") {
          return new Response(
            JSON.stringify({ error: "Google Cloud authentication failed. Please check service account credentials." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }
    const finalBase64 = currentPersonBase64;

    // Upload final result to storage
    console.log("Uploading generated image to storage...");
    const bytes = Uint8Array.from(atob(finalBase64), (c) => c.charCodeAt(0));

    const fileName = `generated-${session.id}-${Date.now()}.jpg`;
    const filePath = `generated-looks/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vto-images")
      .upload(filePath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Failed to upload generated image:", uploadError);
      throw new Error("Failed to save generated image");
    }

    // Get a signed URL valid for 24 hours
    const { data: signedData, error: signedError } = await supabase.storage
      .from("vto-images")
      .createSignedUrl(filePath, 86400);

    if (signedError || !signedData?.signedUrl) {
      console.error("Failed to create signed URL:", signedError);
      throw new Error("Failed to create image URL");
    }

    console.log("Generated image uploaded and signed URL created");

    // Increment generation count
    await supabase
      .from("vto_sessions")
      .update({ generation_count: session.generation_count + 1 })
      .eq("id", session.id);

    console.log("Generation successful, count updated to:", session.generation_count + 1);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: signedData.signedUrl,
        message: "Virtual try-on generated successfully",
        generationsRemaining: MAX_GENERATIONS_PER_SESSION - session.generation_count - 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Virtual try-on error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate virtual try-on",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
