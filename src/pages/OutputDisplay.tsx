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

interface BodyMeasurements {
  height_cm?: number;
  shoulder_width_cm?: number;
  chest_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  arm_length_cm?: number;
  inseam_cm?: number;
  build?: string;
  recommended_size?: string;
  confidence?: string;
}

interface SessionOutput {
  id: string;
  session_token: string;
  registration_status: string;
  selfie_url: string | null;
  full_body_url: string | null;
  generated_look_url: string | null;
  generated_video_url: string | null;
  body_measurements: BodyMeasurements | null;
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
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [captureSession, setCaptureSession] = useState<{ id: string; token: string } | null>(null);
  const [activeScreen, setActiveScreen] = useState<string>('1');
  const displayStartTime = useRef<number | null>(null);
  const loadingStartTime = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dismissedSessionIds = useRef<Set<string>>(new Set());
  const captureHandledIds = useRef<Set<string>>(new Set());
  const videoRequestedIds = useRef<Set<string>>(new Set());
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
      setMeasurements(null);
      setShowMeasurements(false);
      setCurrentSessionId(null);
      setCaptureSession(null);
      displayStartTime.current = null;
      setIsTransitioning(false);
    }, 300);
  };

  // ── Shared headers (stable ref) ──────────────────────────────────────────
  const headersRef = useRef({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  });

  // ── Poll for sessions (single combined query per cycle) ─────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const headers = headersRef.current;

        if (displayState === 'loading' && loadingStartTime.current) {
          if (Date.now() - loadingStartTime.current > LOADING_TIMEOUT_MS) {
            console.warn('Loading timeout reached, resetting to idle');
            resetToIdle();
            return;
          }
        }

        // ── IDLE: single query finds both capture-pending AND generating sessions ──
        if (displayState === 'idle' || displayState === 'capture_done') {
          const cutoff10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?updated_at=gte.${cutoff10m}&order=updated_at.desc&limit=5&select=id,session_token,registration_status,selfie_url,full_body_url,generated_look_url,generated_video_url`,
            { headers }
          );
          if (res.ok) {
            const rows: SessionOutput[] = await res.json();
            for (const row of rows) {
              if (dismissedSessionIds.current.has(row.id)) continue;

              // Capture-pending: has selfie but no full body
              if (displayState === 'idle' && row.selfie_url && !row.full_body_url && !captureHandledIds.current.has(row.id)) {
                captureHandledIds.current.add(row.id);
                setCurrentSessionId(row.id);
                setCaptureSession({ id: row.id, token: row.session_token });
                setDisplayState('capture');
                return;
              }

              // Generating: waiting for look
              if (row.registration_status === 'generating' && !row.generated_look_url) {
                setCurrentSessionId(row.id);
                loadingStartTime.current = Date.now();
                setDisplayState('loading');
                return;
              }
            }
          }
        }

        // ── LOADING/READY: poll only current session ──
        if ((displayState === 'capture_done' || displayState === 'loading' || displayState === 'ready') && currentSessionId) {
          const lookRes = await fetch(
            `${SUPABASE_URL}/rest/v1/vto_sessions?id=eq.${currentSessionId}&select=id,session_token,registration_status,generated_look_url,generated_video_url,body_measurements`,
            { headers }
          );
          if (!lookRes.ok) return;
          const lookData: SessionOutput[] = await lookRes.json();
          const row = lookData?.[0];
          if (!row || dismissedSessionIds.current.has(row.id)) return;

          const { id, generated_look_url, generated_video_url, body_measurements, registration_status } = row;

          // New look arrived
          if (generated_look_url && generated_look_url !== generatedLook) {
            displayStartTime.current = Date.now();
            setIsTransitioning(true);
            setTimeout(() => {
              setGeneratedLook(generated_look_url);
              setVideoUrl(null);
              setMeasurements(body_measurements ?? null);
              setShowMeasurements(!!body_measurements);
              setCurrentSessionId(id);
              setDisplayState('ready');
              setCaptureSession(null);
              setIsTransitioning(false);
            }, 300);

            // Trigger video generation (fire-and-forget)
            if (!videoRequestedIds.current.has(id)) {
              videoRequestedIds.current.add(id);
              fetch(`${SUPABASE_URL}/functions/v1/generate-video`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: id }),
              }).catch(e => console.error('Video trigger failed:', e));
            }
            return;
          }

          // Update measurements/video if they arrive after initial look
          if (displayState === 'ready') {
            if (body_measurements && !measurements) {
              setMeasurements(body_measurements);
              setShowMeasurements(true);
            }
            if (generated_video_url && generated_video_url !== videoUrl && generatedLook) {
              displayStartTime.current = Date.now();
              setVideoUrl(generated_video_url);
            }
            return;
          }

          // Generation failed: no longer generating and no look
          if (displayState === 'loading' && registration_status !== 'generating' && !generated_look_url) {
            console.warn('Session no longer generating and no look URL — resetting');
            resetToIdle();
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [displayState, generatedLook, videoUrl, currentSessionId, measurements]);

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

        <div className="relative flex items-center gap-6" style={{ height: '95vh' }}>
          {/* Main VTO image/video */}
          <div
            className="relative overflow-hidden rounded-2xl flex-shrink-0"
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

          {/* Size Recommendation & Measurements Panel */}
          {showMeasurements && measurements && (
            <div
              className="flex-shrink-0 rounded-2xl overflow-hidden"
              style={{
                width: '300px',
                maxHeight: '95vh',
                background: 'rgba(15, 15, 20, 0.88)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                animation: 'fadeSlideIn 0.6s ease-out forwards',
              }}
            >
              {/* Recommended Size — Hero */}
              {measurements.recommended_size && (
                <div className="px-6 pt-8 pb-5 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-semibold tracking-[0.35em] uppercase text-white/35 mb-3">Suggested Size</p>
                  <div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-3"
                    style={{
                      background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.6) 100%)',
                      boxShadow: '0 8px 32px hsla(var(--primary), 0.25)',
                    }}
                  >
                    <span className="text-3xl font-bold text-white">{measurements.recommended_size}</span>
                  </div>
                  {measurements.build && (
                    <p className="text-xs text-white/40 capitalize">{measurements.build} build</p>
                  )}
                </div>
              )}

              {/* Body Measurements List */}
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-white/35 mb-3">Body Measurements</p>
                <div className="space-y-2.5">
                  {measurements.height_cm != null && <MeasRow label="Height" value={`${measurements.height_cm} cm`} />}
                  {measurements.shoulder_width_cm != null && <MeasRow label="Shoulders" value={`${measurements.shoulder_width_cm} cm`} />}
                  {measurements.chest_cm != null && <MeasRow label="Chest" value={`${measurements.chest_cm} cm`} />}
                  {measurements.waist_cm != null && <MeasRow label="Waist" value={`${measurements.waist_cm} cm`} />}
                  {measurements.hip_cm != null && <MeasRow label="Hip" value={`${measurements.hip_cm} cm`} />}
                  {measurements.arm_length_cm != null && <MeasRow label="Arm" value={`${measurements.arm_length_cm} cm`} />}
                  {measurements.inseam_cm != null && <MeasRow label="Inseam" value={`${measurements.inseam_cm} cm`} />}
                </div>
              </div>

              {/* Confidence */}
              <div className="px-6 pb-5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    measurements.confidence === 'high' ? 'bg-emerald-400' :
                    measurements.confidence === 'medium' ? 'bg-amber-400' : 'bg-orange-400'
                  }`} />
                  <span className="text-[10px] text-white/30">AI estimated · {measurements.confidence ?? 'approximate'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(30px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </div>
    );
  }

  // ── Idle — render the active screen ──────────────────────────────────────
  const IdleScreen = IDLE_SCREENS[activeScreen] ?? WardrobeWallScreen;
  return <IdleScreen />;
};

function MeasRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/45">{label}</span>
      <span className="text-sm font-medium text-white/85 tabular-nums">{value}</span>
    </div>
  );
}

export default OutputDisplay;
