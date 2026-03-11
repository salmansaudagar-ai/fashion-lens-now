import React, { useEffect, useRef, useState } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { ArrowRight, Monitor, User, Loader2 } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const BigScreenHandoffStep: React.FC = () => {
  const { setCurrentStep, sessionId, sessionToken, setSessionId, setSessionToken } = useVTO();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dots, setDots] = useState('');

  // Animate the waiting dots
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(dotsInterval);
  }, []);

  // Poll for full_body_url — written by /display after the full-body photo is taken
  useEffect(() => {
    // Fall back to sessionStorage if context values were lost (e.g. after page reload)
    const activeSessionId = sessionId || sessionStorage.getItem('vto_session_id');
    const activeToken = sessionToken || sessionStorage.getItem('vto_session_token');

    if (!activeSessionId || !activeToken) return;

    // Restore to context if they were only in sessionStorage
    if (!sessionId && activeSessionId) setSessionId(activeSessionId);
    if (!sessionToken && activeToken) setSessionToken(activeToken);

    const poll = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${activeSessionId}&select=full_body_url`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'x-session-token': activeToken,
            },
          }
        );
        if (!res.ok) {
          console.warn(`[BigScreenHandoff] Poll failed: ${res.status} ${res.statusText}`);
          return;
        }
        const rows = await res.json();
        console.log('[BigScreenHandoff] Poll result:', rows?.length, 'rows, full_body_url:', rows?.[0]?.full_body_url ? 'SET' : 'NULL');
        if (rows?.[0]?.full_body_url) {
          clearInterval(intervalRef.current!);
          console.log('[BigScreenHandoff] Full body detected — advancing to catalog');
          setTimeout(() => setCurrentStep(3), 600);
        }
      } catch (err) {
        console.error('BigScreen handoff poll error:', err);
      }
    };

    intervalRef.current = setInterval(poll, 3000);
    poll();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sessionId, sessionToken, setCurrentStep, setSessionId, setSessionToken]);

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-10 py-16 animate-fade-in">

      {/* Animated illustration */}
      <div className="flex items-center gap-6 mb-12">
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">You</span>
        </div>

        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <ArrowRight
              key={i}
              className="w-8 h-8 text-primary"
              style={{
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                opacity: 0.4 + i * 0.3,
              }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
            <Monitor className="w-10 h-10 text-primary" />
          </div>
          <span className="text-xs text-primary font-medium">Big Screen</span>
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-4xl md:text-5xl font-display font-semibold text-foreground text-center leading-tight mb-4">
        Head to the large screen
      </h1>
      <p className="text-muted-foreground text-xl text-center leading-relaxed mb-4 max-w-md">
        Stand in front of the big screen for your full-body photo
      </p>

      {/* Tips */}
      <div className="flex flex-col gap-2 mb-12 text-center">
        {['Stand 2–3 metres away from the camera', 'Face forward, arms slightly out', 'Head to toe in frame'].map(tip => (
          <p key={tip} className="text-muted-foreground/70 text-sm">• {tip}</p>
        ))}
      </div>

      {/* Waiting indicator */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-base">Waiting for full-body photo{dots}</span>
      </div>
    </div>
  );
};
