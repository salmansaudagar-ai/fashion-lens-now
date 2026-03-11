import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionToken, updates } = await req.json();

    // Validate session token
    if (!sessionToken || typeof sessionToken !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Session token required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate updates object
    if (!updates || typeof updates !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Updates object required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow specific fields to be updated
    const allowedFields = ['selfie_url', 'full_body_url', 'generated_look_url', 'selected_topwear', 'selected_bottomwear', 'selected_footwear', 'full_name', 'phone', 'registration_status'];
    const sanitizedUpdates: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key] = value;
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid fields to update' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for secure updates
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify session exists and is valid
    const { data: session, error: sessionError } = await supabase
      .from('vto_sessions')
      .select('id, created_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      console.error('Session validation error:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check session age (expire after 24 hours)
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > 24 * 60 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: 'Session expired' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the session
    const { error: updateError } = await supabase
      .from('vto_sessions')
      .update(sanitizedUpdates)
      .eq('id', session.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update session' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Update session error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to update session" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
