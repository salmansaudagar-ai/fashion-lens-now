/**
 * Generate Video — Veo 3 Fast (Image-to-Video)
 *
 * Takes a session ID, downloads the VTO result image from storage,
 * generates a short fashion video using Veo 3 Fast on Vertex AI,
 * uploads the video, and updates the session.
 *
 * Called by the frontend after VTO generation completes.
 *
 * Input body:
 *   sessionId — VTO session ID (required)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
};

const GCP_PROJECT_ID = "fynd-jio-impetus-non-prod";
const GCP_LOCATION = "us-central1";
const VEO_MODEL = "veo-3.0-fast-generate-001";

// ── GCP Auth ────────────────────────────────────────────────

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

// ── Main handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Video] Starting for session ${sessionId}`);
    const start = Date.now();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get session to find the VTO result image
    const { data: session, error: sessErr } = await supabase
      .from("vto_sessions")
      .select("id, generated_look_url")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session?.generated_look_url) {
      return new Response(JSON.stringify({ error: "Session not found or no VTO image" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the VTO result image
    console.log("[Video] Downloading VTO result image...");
    const imgRes = await fetch(session.generated_look_url);
    if (!imgRes.ok) throw new Error(`Failed to download VTO image: ${imgRes.status}`);
    const imgBuffer = await imgRes.arrayBuffer();
    // Chunked base64 encoding to avoid stack overflow
    const imgBytes = new Uint8Array(imgBuffer);
    let imgBase64 = "";
    const CHUNK = 32768;
    for (let i = 0; i < imgBytes.length; i += CHUNK) {
      const chunk = imgBytes.subarray(i, Math.min(i + CHUNK, imgBytes.length));
      imgBase64 += btoa(String.fromCharCode(...chunk));
    }
    // Fix: chunked btoa produces separate padded chunks; use proper approach
    // Re-encode properly using binary string
    let binaryStr = "";
    for (let i = 0; i < imgBytes.length; i += CHUNK) {
      const chunk = imgBytes.subarray(i, Math.min(i + CHUNK, imgBytes.length));
      for (let j = 0; j < chunk.length; j++) {
        binaryStr += String.fromCharCode(chunk[j]);
      }
    }
    imgBase64 = btoa(binaryStr);
    console.log(`[Video] Image downloaded: ${(imgBuffer.byteLength / 1024).toFixed(0)} KB, b64: ${imgBase64.length} chars`);

    // Get GCP access token
    const saJson = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GCP service account not configured");
    const accessToken = await getGcpAccessToken(saJson);

    // Start Veo 3 Fast video generation
    const startUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:predictLongRunning`;
    const prompt = "A fashion model poses subtly with gentle movement, slight turn and sway, professional studio lighting, fashion photography, cinematic quality, smooth slow motion";

    console.log("[Video] Starting Veo 3 Fast generation...");
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{
          prompt,
          image: { bytesBase64Encoded: imgBase64, mimeType: "image/jpeg" },
        }],
        parameters: {
          aspectRatio: "9:16",
          sampleCount: 1,
          durationSeconds: 4,
        },
      }),
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      throw new Error(`Veo start failed ${startRes.status}: ${err.substring(0, 300)}`);
    }

    const startData = await startRes.json();
    const operationName = startData.name;
    if (!operationName) throw new Error("No operation name in Veo response");
    console.log(`[Video] Operation: ${operationName}`);

    // Poll for completion
    const pollUrl = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;
    const MAX_POLLS = 24; // 24 * 5s = 120s
    const POLL_INTERVAL_MS = 5000;

    let videoBase64: string | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(pollUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ operationName }),
      });

      if (!pollRes.ok) {
        console.warn(`[Video] Poll ${i + 1} failed: ${pollRes.status}`);
        continue;
      }

      const pollData = await pollRes.json();
      if (pollData.done) {
        const videos = pollData.response?.videos ?? [];
        if (videos.length > 0 && videos[0].bytesBase64Encoded) {
          videoBase64 = videos[0].bytesBase64Encoded;
          console.log(`[Video] Generation complete after poll ${i + 1}`);
          break;
        }
        // Check for RAI filtering
        const filtered = pollData.response?.raiMediaFilteredCount ?? 0;
        if (filtered > 0) {
          throw new Error(`Video filtered by safety (${filtered} filtered)`);
        }
        throw new Error("Veo completed but no video data returned");
      }
      console.log(`[Video] Poll ${i + 1}/${MAX_POLLS}: generating...`);
    }

    if (!videoBase64) throw new Error("Veo 3 generation timed out after 120s");

    // Upload video to Supabase storage (chunked decode for large videos)
    const videoBinaryStr = atob(videoBase64);
    const videoBytes = new Uint8Array(videoBinaryStr.length);
    for (let i = 0; i < videoBinaryStr.length; i++) {
      videoBytes[i] = videoBinaryStr.charCodeAt(i);
    }
    const videoPath = `generated-videos/veo3-${sessionId}-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("vto-images")
      .upload(videoPath, videoBytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);

    const { data: signedData } = await supabase.storage
      .from("vto-images")
      .createSignedUrl(videoPath, 86400);
    const videoUrl = signedData?.signedUrl;
    if (!videoUrl) throw new Error("Failed to create video URL");

    // Update session
    await supabase
      .from("vto_sessions")
      .update({ generated_video_url: videoUrl })
      .eq("id", sessionId);

    const totalMs = Date.now() - start;
    console.log(`[Video] Done! ${totalMs}ms, ${(videoBytes.length / 1024 / 1024).toFixed(1)} MB`);

    return new Response(
      JSON.stringify({
        success: true,
        videoUrl,
        durationMs: totalMs,
        sizeBytes: videoBytes.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[Video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Video generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
