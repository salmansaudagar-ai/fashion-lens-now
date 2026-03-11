
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS actual_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country_of_origin text NOT NULL DEFAULT '';
