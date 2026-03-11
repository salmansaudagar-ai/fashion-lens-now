-- Allow anonymous users to read the most recent generated look for display purposes
-- This only allows reading id, generated_look_url, and generated_video_url fields
-- when a generated look exists (not exposing sessions without output)
CREATE POLICY "Read generated outputs for display"
ON public.vto_sessions
FOR SELECT
TO anon, authenticated
USING (generated_look_url IS NOT NULL);