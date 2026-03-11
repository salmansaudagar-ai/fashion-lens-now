-- Add generated_video_url column to vto_sessions
ALTER TABLE public.vto_sessions
ADD COLUMN generated_video_url text;