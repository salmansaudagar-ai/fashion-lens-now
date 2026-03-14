import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function validatePin(req: Request): boolean {
  const pin = req.headers.get('x-admin-pin');
  const adminPin = Deno.env.get('ADMIN_PIN');
  return !!pin && !!adminPin && String(pin).trim() === String(adminPin).trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!validatePin(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { products, clear } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return new Response(JSON.stringify({ error: 'No products provided. Send { products: [...], clear?: boolean }' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and sanitize each product
    const sanitized = products.map((p: any, idx: number) => ({
      id: p.id || `upload-${Date.now()}-${idx}`,
      name: String(p.name || 'Untitled'),
      category: p.category || 'topwear',
      image_url: String(p.image_url || ''),
      price: Number(p.price) || 0,
      brand: String(p.brand || ''),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      actual_price: Number(p.actual_price) || Number(p.price) || 0,
      selling_price: Number(p.selling_price) || Number(p.price) || 0,
      country_of_origin: String(p.country_of_origin || 'India'),
      color_variants: Array.isArray(p.color_variants) ? p.color_variants : [],
      is_active: p.is_active !== false,
      sort_order: Number(p.sort_order) || idx + 1,
    }));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Optionally clear existing catalog
    if (clear === true) {
      await supabase.from('catalog_items').delete().neq('id', '__keep_nothing__');
    }

    // Upsert products (on conflict by id)
    const { data, error } = await supabase.from('catalog_items').upsert(sanitized, { onConflict: 'id' }).select('id, name');
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      count: sanitized.length,
      products: (data || []).map((p: any) => ({ id: p.id, name: p.name })),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Processing failed: ${(err as Error).message}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
