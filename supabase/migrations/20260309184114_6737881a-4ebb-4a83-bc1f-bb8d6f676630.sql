
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App settings are publicly readable"
  ON public.app_settings FOR SELECT
  TO public USING (true);

INSERT INTO public.app_settings (key, value, label, description, type) VALUES
  ('display_duration_ms', '120000', 'Display Duration (ms)', 'How long the generated look stays on screen on the /display page', 'number'),
  ('vto_welcome_title', 'Virtual Try-On', 'Welcome Screen Title', 'Main heading shown on the VTO welcome screen', 'text'),
  ('vto_welcome_subtitle', 'See how outfits look on you in seconds', 'Welcome Screen Subtitle', 'Subheading shown on the VTO welcome screen', 'text'),
  ('generation_timeout_ms', '120000', 'Generation Timeout (ms)', 'Maximum time to wait for AI generation before showing a timeout error', 'number');
