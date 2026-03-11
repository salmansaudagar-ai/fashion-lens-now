import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

// Convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  // Remove data URL prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FAL_API_KEY = Deno.env.get('FAL_API_KEY');
    if (!FAL_API_KEY) {
      console.error('FAL_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'FAL_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let publicImageUrl = imageUrl;

    // If it's base64, upload to storage first
    if (imageUrl.startsWith('data:')) {
      console.log('Uploading base64 image to storage...');
      
      const fileName = `video-input-${Date.now()}.png`;
      const filePath = `video-inputs/${fileName}`;
      const imageBytes = base64ToUint8Array(imageUrl);

      const { error: uploadError } = await supabase.storage
        .from('vto-images')
        .upload(filePath, imageBytes, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error('Failed to upload image:', uploadError);
        return new Response(
          JSON.stringify({ error: 'Failed to upload image for video generation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get a signed URL (valid for 1 hour)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('vto-images')
        .createSignedUrl(filePath, 3600);

      if (signedError || !signedData?.signedUrl) {
        console.error('Failed to create signed URL:', signedError);
        return new Response(
          JSON.stringify({ error: 'Failed to create image URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      publicImageUrl = signedData.signedUrl;
      console.log('Image uploaded, signed URL created');
    }

    console.log('Generating 360 video for image URL:', publicImageUrl.substring(0, 100) + '...');

    // Call fal.ai API
    const response = await fetch('https://queue.fal.run/fal-ai/pixverse/v5.5/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Person rotates in 360 in slow motion',
        image_url: publicImageUrl,
        resolution: '720p',
        duration: '5',
        negative_prompt: 'blurry, low quality, pixelated, grainy',
        generate_audio_switch: false,
        generate_multi_clip_switch: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('fal.ai API error:', data);
      return new Response(
        JSON.stringify({ error: data.detail || 'Failed to start video generation' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Video generation queued:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        requestId: data.request_id,
        status: data.status,
        statusUrl: data.status_url,
        responseUrl: data.response_url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error generating 360 video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
