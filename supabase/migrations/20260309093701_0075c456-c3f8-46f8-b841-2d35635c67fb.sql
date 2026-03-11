-- Allow the /display page to read sessions that have a selfie captured
-- (so it can trigger the full-body capture flow on the big screen)
CREATE POLICY "Read sessions pending full body for display"
ON public.vto_sessions
FOR SELECT
TO anon, authenticated
USING (selfie_url IS NOT NULL AND full_body_url IS NULL);

-- Also allow reading sessions with 'generating' status for the loading screen
CREATE POLICY "Read generating sessions for display"
ON public.vto_sessions
FOR SELECT
TO anon, authenticated
USING (registration_status = 'generating');