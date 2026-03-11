-- Add session_token column to vto_sessions for secure session-based access
ALTER TABLE public.vto_sessions 
ADD COLUMN session_token text DEFAULT gen_random_uuid()::text NOT NULL;

-- Add generation_count for rate limiting
ALTER TABLE public.vto_sessions 
ADD COLUMN generation_count integer DEFAULT 0 NOT NULL;

-- Create unique index on session_token
CREATE UNIQUE INDEX idx_vto_sessions_token ON public.vto_sessions(session_token);

-- Drop existing overly permissive RLS policies
DROP POLICY IF EXISTS "Anyone can create VTO sessions" ON public.vto_sessions;
DROP POLICY IF EXISTS "Anyone can read VTO sessions" ON public.vto_sessions;
DROP POLICY IF EXISTS "Anyone can update VTO sessions" ON public.vto_sessions;

-- Create new restrictive RLS policies
-- Allow anyone to create a session (needed for kiosk flow)
CREATE POLICY "Allow session creation" 
ON public.vto_sessions 
FOR INSERT 
WITH CHECK (true);

-- Allow reading own session only (via session_token passed in header)
CREATE POLICY "Read own session only" 
ON public.vto_sessions 
FOR SELECT 
USING (
  session_token = COALESCE(
    current_setting('request.headers', true)::json->>'x-session-token',
    ''
  )
);

-- Allow updating own session only
CREATE POLICY "Update own session only" 
ON public.vto_sessions 
FOR UPDATE 
USING (
  session_token = COALESCE(
    current_setting('request.headers', true)::json->>'x-session-token',
    ''
  )
);

-- Make storage bucket private
UPDATE storage.buckets SET public = false WHERE id = 'vto-images';

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Anyone can upload VTO images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view VTO images" ON storage.objects;
DROP POLICY IF EXISTS "Public VTO image access" ON storage.objects;

-- Create session-based storage policies
CREATE POLICY "Upload to own session folder" ON storage.objects
FOR INSERT 
WITH CHECK (
  bucket_id = 'vto-images' AND
  (storage.foldername(name))[1] = COALESCE(
    current_setting('request.headers', true)::json->>'x-session-token',
    ''
  )
);

CREATE POLICY "View own session images" ON storage.objects
FOR SELECT 
USING (
  bucket_id = 'vto-images' AND
  (storage.foldername(name))[1] = COALESCE(
    current_setting('request.headers', true)::json->>'x-session-token',
    ''
  )
);