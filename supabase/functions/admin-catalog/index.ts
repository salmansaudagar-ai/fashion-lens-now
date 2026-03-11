import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-pin',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const url = new URL(req.url);

  // GET — public, no auth needed
  if (req.method === 'GET') {
    const category = url.searchParams.get('category');
    let query = supabase.from('catalog_items').select('*').order('sort_order', { ascending: true });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: data }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // All write operations require PIN
  if (!validatePin(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { name, category, image_url, price, brand, sizes, actual_price, selling_price, country_of_origin, color_variants, is_active, sort_order } = body;
    if (!name || !category || !image_url) {
      return new Response(JSON.stringify({ error: 'name, category, image_url are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Generate ID from name
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { data, error } = await supabase.from('catalog_items').insert({
      id,
      name,
      category,
      image_url,
      price: price ?? 0,
      brand: brand ?? '',
      sizes: sizes ?? [],
      actual_price: actual_price ?? 0,
      selling_price: selling_price ?? 0,
      country_of_origin: country_of_origin ?? '',
      color_variants: color_variants ?? [],
      is_active: is_active ?? true,
      sort_order: sort_order ?? 99,
    }).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ item: data }), {
      status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'PUT') {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const allowed = ['name', 'category', 'image_url', 'price', 'brand', 'sizes', 'actual_price', 'selling_price', 'country_of_origin', 'color_variants', 'is_active', 'sort_order'];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in updates) sanitized[key] = updates[key];
    }
    const { data, error } = await supabase.from('catalog_items').update(sanitized).eq('id', id).select().single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ item: data }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'id query param required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { error } = await supabase.from('catalog_items').delete().eq('id', id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
