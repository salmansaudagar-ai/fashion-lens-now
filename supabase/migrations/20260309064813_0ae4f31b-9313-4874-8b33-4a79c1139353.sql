
-- Add registration_status column to vto_sessions
ALTER TABLE public.vto_sessions
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'pending';

-- Enable Realtime on vto_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.vto_sessions;
