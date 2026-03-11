-- Fix: The INSERT policy is RESTRICTIVE which requires at least one PERMISSIVE policy
-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Allow session creation" ON public.vto_sessions;

-- Create a PERMISSIVE INSERT policy (this is what allows public session creation)
CREATE POLICY "Allow session creation" 
ON public.vto_sessions 
FOR INSERT 
TO public
WITH CHECK (true);