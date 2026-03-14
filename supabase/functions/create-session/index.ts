import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Service role used to avoid RLS on returning the newly created row.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse optional kiosk_id from request body
    let kioskId: string | null = null;
    try {
      const body = await req.json();
      if (body?.kiosk_id) kioskId = String(body.kiosk_id).trim();
    } catch { /* empty body is fine */ }

    // Create anonymous session with default values
    const { data, error } = await supabase
      .from("vto_sessions")
      .insert({
        full_name: "Guest",
        email: null,
        phone: null,
        gender: "unspecified",
        registration_status: "pending",
        ...(kioskId ? { kiosk_id: kioskId } : {}),
      })
      .select("id, session_token")
      .single();

    if (error || !data) {
      console.error("create-session insert error:", error);
      return new Response(JSON.stringify({ error: "Failed to create session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ id: data.id, sessionToken: data.session_token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-session error:", error);
    return new Response(JSON.stringify({ error: "Failed to create session" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
