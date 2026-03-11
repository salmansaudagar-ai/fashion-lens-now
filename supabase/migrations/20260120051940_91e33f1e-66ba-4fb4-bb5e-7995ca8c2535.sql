-- Ensure API roles can access vto_sessions (RLS still enforces row access)
GRANT INSERT, SELECT, UPDATE ON TABLE public.vto_sessions TO anon, authenticated;