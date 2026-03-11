
-- Create catalog_items table
CREATE TABLE public.catalog_items (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('topwear', 'bottomwear', 'footwear')),
  image_url TEXT NOT NULL,
  color_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index on category for fast filtering
CREATE INDEX idx_catalog_items_category ON public.catalog_items (category);
CREATE INDEX idx_catalog_items_sort ON public.catalog_items (category, sort_order);

-- Enable RLS
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

-- Public read (anon kiosk)
CREATE POLICY "Catalog is publicly readable" ON public.catalog_items
  FOR SELECT USING (true);

-- No direct write from anon — only service role (edge functions) can write
-- (No INSERT/UPDATE/DELETE policies for anon/authenticated — service role bypasses RLS)

-- Auto-update updated_at
CREATE TRIGGER update_catalog_items_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
