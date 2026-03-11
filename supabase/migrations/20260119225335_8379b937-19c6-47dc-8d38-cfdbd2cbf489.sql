-- Create storage bucket for VTO user images
INSERT INTO storage.buckets (id, name, public) VALUES ('vto-images', 'vto-images', true);

-- Create RLS policies for the storage bucket
CREATE POLICY "Anyone can upload VTO images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vto-images');

CREATE POLICY "Anyone can view VTO images"
ON storage.objects FOR SELECT
USING (bucket_id = 'vto-images');

-- Create table for VTO sessions/registrations
CREATE TABLE public.vto_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gender TEXT NOT NULL,
  selfie_url TEXT,
  full_body_url TEXT,
  generated_look_url TEXT,
  selected_topwear JSONB,
  selected_bottomwear JSONB,
  selected_footwear JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vto_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public VTO kiosk)
CREATE POLICY "Anyone can create VTO sessions"
ON public.vto_sessions FOR INSERT
WITH CHECK (true);

-- Allow anyone to read their own session (by id)
CREATE POLICY "Anyone can read VTO sessions"
ON public.vto_sessions FOR SELECT
USING (true);

-- Allow updates to VTO sessions
CREATE POLICY "Anyone can update VTO sessions"
ON public.vto_sessions FOR UPDATE
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_vto_sessions_updated_at
BEFORE UPDATE ON public.vto_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();