import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';
import { DisplayCaptureFlow } from '@/components/vto/DisplayCaptureFlow';
import { WardrobeWallScreen } from '@/components/display/WardrobeWallScreen';
import { EditorialScreen } from '@/components/display/EditorialScreen';
import { NeonTypewriterScreen } from '@/components/display/NeonTypewriterScreen';
import { MosaicSplashScreen } from '@/components/display/MosaicSplashScreen';
import { SpotlightCarouselScreen } from '@/components/display/SpotlightCarouselScreen';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface SessionOutput {
  id: string;
  session_token: string;
  registration_status: string;
  selfie_url: string | null;
  full_body_url: string | null;
  generated_look_url: string | null;
  generated_video_url: string | null;
}

type DisplayState = 'idle' | 'capture' | 'capture_done' | 'loading' | 'ready';

const DISPLAY_DURATION_MS = 2 * 60 * 1000;

// ── Screen registry — add new screens here ────────────────────────────────────
const IDLE_SCREENS: Record<string, React.FC> = {
  '1': WardrobeWallScreen,
  '2': EditorialScreen,
  '3': NeonTypewriterScreen,
  '4': MosaicSplashScreen,
  '5': SpotlightCarouselScreen,
};

export const OutputDisplay: React.FC = () => {
  const [displayState, setDisplayState] = useState<DisplayState>('idle');
  const [generatedLook, setGeneratedLook] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [captureSession, setCaptureSession] = useState<{ id: string; token: string } | null>(null);
  const [activeScreen, setActiveScreen] = useState<string>('1');
  const displayStartTime = useRef<number | null>(null);
  const loadingStartTime = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dismissedSessionIds = useRef<Set<string>>(new Set());
  const captureHandledIds = useRef<Set<string>>(new Set());
  const LOADING_TIMEOUT_MS = 3 * 60 * 1000;

  // ── Fetch active screen setting ───────────────────────────────────────────
  useEffect(() => {
    const fetchScreen = async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/app_settings?key=eq.display_idle_screen&select=value`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.[0]?.value) setActiveScreen(data[0].value);
        }
      } catch {
        // keep default
      }
    };
    fetchScreen();
    // Re-check every 30s so admin changes reflect without reload
    const interval = setInterval(fetchScreen, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Auto-reset to idle after display duration ─────────────────────────────
  useEffect(() => {
    if (displayState === 'ready' && generatedLook) {
      if (!displayStartTime.current) displayStartTime.current = Date.now();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const elapsed = Date.now() - displayStartTime.current;
      const remaining = DISPLAY_DURATION_MS - elapsed;
      if (remaining <= 0) {
        resetToIdle();
      } else {
        timeoutRef.current = setTimeout(() => resetToIdle(), remaining);
      }
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [displayState, generatedLook]);

  const resetToIdle = () => {
    if (currentSessionId) dismissedSessionIds.current.add(currentSessionId);
    setIsTransitioning(true);
    loadingStartTime.current = null;
    setTimeout(() => {
      setDisplayState('idle');
      setGeneratedLook(null);
      setVideoUrl(null);
      setCurrentSessionId(null);
      setCaptureSession(null);
      displayStartTime.current = null;
      setIsTransitioning(false);
    }, 300);
  };

  // ── Poll for sessions ─────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const headers = {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        };

        if (displayState === 'loading' && loadingStartTime.current) {
          const elapsed = Date.now() - loadingStartTime.current;
          if (elapsed > LOADING_TIMEOUT_MS) {
            console.warn('Loading timeout reached, resetting to idle');
            resetToIdle();
            return;
          }
        }

        if (displayState === 'idle') {
          const pendingRes = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?selfie_url=not.is.null&full_body_url=is.null&updated_at=gte.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}&order=updated_at.desc&limit=1&select=id,session_token,registration_status,selfie_url,full_body_url,generated_look_url,generated_video_url`,
            { headers }
          );
          if (pendingRes.ok) {
            const pending: SessionOutput[] = await pendingRes.json();
            if (pending?.[0] && !captureHandledIds.current.has(pending[0].id) && !dismissedSessionIds.current.has(pending[0].id)) {
              captureHandledIds.current.add(pending[0].id);
              setCurrentSessionId(pending[0].id);
              setCaptureSession({ id: pending[0].id, token: pending[0].session_token });
              setDisplayState('capture');
              return;
            }
          }
        }

        if (displayState === 'idle' || displayState === 'capture_done') {
          const genRes = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?registration_status=eq.generating&generated_look_url=is.null&updated_at=gte.${new Date(Date.now() - 3 * 60 * 1000).toISOString()}&order=updated_at.desc&limit=1&select=id,session_token,registration_status,selfie_url,full_body_url,generated_look_url,generated_video_url`,
            { headers }
          );
          if (genRes.ok) {
            const genData: SessionOutput[] = await genRes.json();
            if (genData?.[0] && !dismissedSessionIds.current.has(genData[0].id)) {
              setCurrentSessionId(genData[0].id);
              loadingStartTime.current = Date.now();
              setDisplayState('loading');
              return;
            }
          }
        }

        if ((displayState === 'capture_done' || displayState === 'loading' || displayState === 'ready') && currentSessionId) {
          // Query by generated_look_url (allowed by RLS for anon) — this works once generation completes
          const lookRes = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${currentSessionId}&generated_look_url=not.is.null&select=id,session_token,registration_status,generated_look_url,generated_video_url`,
            { headers }
          );
          const lookData: SessionOutput[] = await lookRes.json();
          if (lookData?.[0]) {
            const { id, generated_look_url, generated_video_url } = lookData[0];
            if (dismissedSessionIds.current.has(id)) return;
            const hasNewLook = generated_look_url && generated_look_url !== generatedLook;
            if (hasNewLook && generated_look_url) {
              displayStartTime.current = Date.now();
              setIsTransitioning(true);
              setTimeout(() => {
                setGeneratedLook(generated_look_url);
                setVideoUrl(null);
                setCurrentSessionId(id);
                setDisplayState('ready');
                setCaptureSession(null);
                setIsTransitioning(false);
              }, 300);
            }
            if (displayState === 'ready' && generated_video_url && generated_video_url !== videoUrl && generatedLook) {
              displayStartTime.current = Date.now();
              setVideoUrl(generated_video_url);
            }
            return;
          }

          // If still in loading and no look yet, check if 'generating' status has ended (failed/reset)
          // by querying sessions still in generating state for this ID
          if (displayState === 'loading') {
            const stillGenRes = await fetch(
              `${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${currentSessionId}&registration_status=eq.generating&select=id`,
              { headers }
            );
            const stillGenData = await stillGenRes.json();
            // If generation status is gone (no longer 'generating') and no look URL, generation failed — reset
            if (Array.isArray(stillGenData) && stillGenData.length === 0) {
              console.warn('Session no longer generating and no look URL found — resetting to idle');
              resetToIdle();
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [displayState, generatedLook, videoUrl, currentSessionId]);

  const handleCaptureComplete = useCallback(() => {
    setDisplayState('capture_done');
    setCaptureSession(null);
    setTimeout(() => {
      setDisplayState(prev => prev === 'capture_done' ? 'idle' : prev);
    }, 30_000);
  }, []);

  // ── Capture flow ─────────────────────────────────────────────────────────
  if (displayState === 'capture' && captureSession) {
    return (
      <DisplayCaptureFlow
        sessionId={captureSession.id}
        sessionToken={captureSession.token}
        onComplete={handleCaptureComplete}
      />
    );
  }

  // ── Capture done ──────────────────────────────────────────────────────────
  if (displayState === 'capture_done') {
    return (
      <div className="fixed inset-0 bg-[hsl(var(--charcoal-deep))] flex flex-col items-center justify-center gap-8 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <svg className="w-12 h-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center space-y-3">
          <h2 className="text-4xl font-display font-semibold text-foreground">Photos saved!</h2>
          <p className="text-muted-foreground text-xl">Head back to the kiosk to browse the catalog</p>
        </div>
        <img src={trendsLogo} alt="Trends" className="h-8 object-contain opacity-40 mt-4" />
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (displayState === 'loading') {
    return (
      <div className="fixed inset-0 bg-[hsl(var(--charcoal-deep))] flex flex-col items-center justify-center gap-8 animate-fade-in">
        <div className="relative">
          <div className="w-40 h-40 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
            <Loader2 className="w-20 h-20 text-primary/50 animate-spin" />
          </div>
          <div className="absolute inset-0 w-40 h-40 rounded-full border-2 border-primary/20 animate-pulse" />
        </div>
        <div
          className="text-center space-y-2 px-10 py-6 rounded-2xl"
          style={{ background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(20px)' }}
        >
          <p className="text-2xl text-foreground/90 font-display">Creating your look</p>
          <p className="text-lg text-muted-foreground/70">AI is styling your outfit…</p>
        </div>
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────
  if (displayState === 'ready') {
    return (
      <div className={`fixed inset-0 flex items-center justify-center bg-[hsl(var(--charcoal-deep))] transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {(videoUrl || generatedLook) && (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={generatedLook ?? undefined}
              alt=""
              className="w-full h-full object-cover scale-110"
              style={{ filter: 'blur(40px)', opacity: 0.25 }}
            />
          </div>
        )}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{ height: '95vh', width: 'calc(95vh * 9 / 16)', boxShadow: '0 40px 120px rgba(0,0,0,0.8)' }}
        >
          {videoUrl ? (
            <video src={videoUrl} autoPlay loop muted playsInline preload="auto"
              className="absolute inset-0 w-full h-full object-cover" />
          ) : generatedLook ? (
            <img src={generatedLook} alt="Your Virtual Look" onError={resetToIdle}
              className="absolute inset-0 w-full h-full object-cover" />
          ) : null}
          <button onClick={resetToIdle}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 shadow-sm transition-all duration-200 hover:scale-105"
            aria-label="Close">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
            <div className="px-4 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
              <span className="text-xs font-medium text-white/60 tracking-[0.25em] uppercase">Your Virtual Look · Trends</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Idle — render the active screen ──────────────────────────────────────
  const IdleScreen = IDLE_SCREENS[activeScreen] ?? WardrobeWallScreen;
  return <IdleScreen />;
};

export default OutputDisplay;
