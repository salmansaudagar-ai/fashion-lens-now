import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { SwitchCamera, RotateCcw, X, Loader2, PersonStanding } from 'lucide-react';
import { useFaceAlignment, AlignmentStatus } from '@/hooks/useFaceAlignment';
import trendsLogo from '@/assets/trends-logo.png';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const AUTO_CAPTURE_SECONDS = 5;

type CapturePhase = 'selfie' | 'fullbody';
type CaptureMode = 'camera' | 'preview';

interface DisplayCaptureFlowProps {
  sessionId: string;
  sessionToken: string;
  onComplete: () => void; // called once both photos are uploaded
}

// ─── helpers ────────────────────────────────────────────────────────────────

function ovalStyle(status: AlignmentStatus, countdown: number | null) {
  if (status === 'aligned' || countdown !== null) {
    return { stroke: '#22c55e', glow: true, filter: 'drop-shadow(0 0 12px #22c55e)' };
  }
  if (status === 'loading' || status === 'no_face') {
    return { stroke: 'rgba(255,255,255,0.45)', glow: false };
  }
  return { stroke: '#ef4444', glow: false, filter: 'drop-shadow(0 0 8px #ef4444)' };
}

function hintText(status: AlignmentStatus): string {
  switch (status) {
    case 'loading':    return '⏳ Initialising face detection…';
    case 'no_face':    return '👤 Position your face in the oval';
    case 'too_far':    return '🔍 Move closer';
    case 'too_close':  return '↔️  Move farther away';
    case 'off_centre': return '↕️  Centre your face';
    case 'aligned':    return '✅ Hold still…';
  }
}

// ─── Oval SVG overlay ───────────────────────────────────────────────────────
const OvalGuide: React.FC<{ status: AlignmentStatus; countdown: number | null; holdProgress: number }> = ({ status, countdown, holdProgress }) => {
  const { stroke, glow, filter } = ovalStyle(status, countdown);
  const isAligned = status === 'aligned' || countdown !== null;
  const cx = 50; const cy = 46; const rx = 30; const ry = 38;
  const circumference = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  const progressOffset = circumference - (holdProgress / 100) * circumference;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: filter ?? undefined }}>
      <defs>
        <mask id="oval-mask-d">
          <rect width="100" height="100" fill="white" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
        </mask>
        {glow && (
          <filter id="glow-filter-d" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <rect width="100" height="100" fill="rgba(0,0,0,0.45)" mask="url(#oval-mask-d)" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth="0.8"
        className="transition-all duration-300" style={{ filter: glow ? 'url(#glow-filter-d)' : undefined }} />
      {isAligned && countdown === null && (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#22c55e" strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${progressOffset}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-[stroke-dashoffset] duration-100 ease-linear" />
      )}
      {['tl', 'tr', 'bl', 'br'].map(corner => {
        const x1 = corner.includes('l') ? cx - rx - 0.5 : cx + rx + 0.5;
        const y1 = corner.includes('t') ? cy - ry - 0.5 : cy + ry + 0.5;
        const dx = corner.includes('l') ? 4 : -4;
        const dy = corner.includes('t') ? 4 : -4;
        return (
          <g key={corner}>
            <line x1={x1} y1={y1} x2={x1 + dx} y2={y1} stroke={stroke} strokeWidth="1.2" strokeLinecap="round" className="transition-all duration-300" />
            <line x1={x1} y1={y1} x2={x1} y2={y1 + dy} stroke={stroke} strokeWidth="1.2" strokeLinecap="round" className="transition-all duration-300" />
          </g>
        );
      })}
    </svg>
  );
};

const CountdownOverlay: React.FC<{ countdown: number }> = ({ countdown }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <div key={countdown} className="text-white font-black drop-shadow-2xl select-none"
      style={{ fontSize: 'clamp(5rem, 20vw, 9rem)', animation: 'countPop 0.35s cubic-bezier(0.34,1.56,0.64,1)', textShadow: '0 0 40px rgba(34,197,94,0.8)' }}>
      {countdown === 0 ? '📸' : countdown}
    </div>
  </div>
);

const HintPill: React.FC<{ status: AlignmentStatus; countdown: number | null }> = ({ status, countdown }) => {
  const isGreen = status === 'aligned' || countdown !== null;
  const text = countdown !== null && countdown > 0 ? `📸 Capturing in ${countdown}…` : countdown === 0 ? '📸 Capturing…' : hintText(status);
  return (
    <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none px-6">
      <div className={cn('flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-md text-white text-sm font-semibold shadow-lg transition-all duration-300',
        isGreen ? 'bg-green-500/30 border border-green-400/50 shadow-green-500/20'
          : status === 'loading' || status === 'no_face' ? 'bg-black/40 border border-white/20'
          : 'bg-red-500/30 border border-red-400/50 shadow-red-500/20')}>
        {text}
      </div>
    </div>
  );
};

const AutoTimerPill: React.FC<{ seconds: number; onCaptureNow: () => void }> = ({ seconds, onCaptureNow }) => (
  <div className="absolute bottom-36 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none px-6">
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg width="80" height="80" className="rotate-[-90deg] absolute inset-0">
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--primary))" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 34}`}
          strokeDashoffset={`${2 * Math.PI * 34 * (seconds / AUTO_CAPTURE_SECONDS)}`}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
      </svg>
      <span key={seconds} className="text-3xl font-black text-white drop-shadow-lg z-10"
        style={{ animation: 'countPop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
        {seconds > 0 ? seconds : '📸'}
      </span>
    </div>
    <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-sm font-semibold pointer-events-auto cursor-pointer"
      onClick={onCaptureNow}>
      📸 {seconds > 0 ? `Auto-capture in ${seconds}s · Tap to capture now` : 'Capturing…'}
    </div>
  </div>
);

// ─── Preview / confirm overlay ──────────────────────────────────────────────
const AutoConfirmOverlay: React.FC<{ photo: string; onRetake: () => void; onConfirm: () => void; isSaving: boolean; label: string }> = ({ photo, onRetake, onConfirm, isSaving, label }) => {
  const [remaining, setRemaining] = useState(2);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { if (intervalRef.current) clearInterval(intervalRef.current); setTimeout(onConfirm, 0); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 bg-background flex flex-col animate-fade-in">
      <div className="flex-1 relative">
        <img src={photo} alt={label} className="w-full h-full object-contain" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/80" />
        <div className="absolute top-8 left-0 right-0 text-center">
          <h2 className="text-2xl font-display font-semibold text-white drop-shadow-lg">
            {isSaving ? 'Saving…' : `Saving in ${remaining}s`}
          </h2>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-8 flex gap-6 justify-center">
        <button onClick={onRetake} disabled={isSaving}
          className="flex items-center justify-center gap-3 px-8 py-5 bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl text-white text-lg font-medium transition-all hover:bg-white/20 active:scale-95 disabled:opacity-50">
          <RotateCcw className="w-6 h-6" /> Retake
        </button>
        <button onClick={onConfirm} disabled={isSaving}
          className="flex items-center justify-center gap-3 px-10 py-5 bg-primary rounded-2xl text-primary-foreground text-lg font-semibold transition-all hover:bg-primary/90 active:scale-95 shadow-lg shadow-primary/30 disabled:opacity-70">
          {isSaving ? <><Loader2 className="w-6 h-6 animate-spin" /> Saving…</> : 'Use Now'}
        </button>
      </div>
    </div>
  );
};

// ─── Upload helper (direct REST, no VTOContext) ─────────────────────────────
async function uploadImageToStorage(base64: string, sessionToken: string, type: 'selfie' | 'fullbody'): Promise<string | null> {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  const file = new File([u8arr], `${type}.jpg`, { type: mime });
  const filename = `${sessionToken}/${type}-${Date.now()}.jpg`;

  console.log(`[DisplayCapture] Uploading ${type}, size: ${file.size} bytes, filename: ${filename}`);

  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/vto-images/${filename}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'x-session-token': sessionToken,
      'Content-Type': mime,
    },
    body: file,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    console.error(`[DisplayCapture] Upload failed: ${uploadRes.status} ${uploadRes.statusText}`, errText);
    return null;
  }
  console.log(`[DisplayCapture] Upload succeeded, getting signed URL...`);

  const signedRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/vto-images/${filename}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 86400 }),
  });
  if (!signedRes.ok) {
    const errText = await signedRes.text().catch(() => '');
    console.error(`[DisplayCapture] Sign URL failed: ${signedRes.status} ${signedRes.statusText}`, errText);
    return null;
  }
  const signedData = await signedRes.json();
  console.log(`[DisplayCapture] Signed URL obtained successfully`);
  return `${SUPABASE_URL}/storage/v1${signedData.signedURL}`;
}

async function updateSessionField(sessionToken: string, updates: Record<string, string | null>): Promise<boolean> {
  console.log(`[DisplayCapture] Updating session:`, Object.keys(updates));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/update-session`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionToken, updates }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[DisplayCapture] update-session failed: ${res.status} ${res.statusText}`, errText);
  } else {
    console.log(`[DisplayCapture] Session updated successfully`);
  }
  return res.ok;
}

// ─── Main component ──────────────────────────────────────────────────────────
// Only captures the full-body photo — selfie is taken on the kiosk
export const DisplayCaptureFlow: React.FC<DisplayCaptureFlowProps> = ({ sessionId, sessionToken, onComplete }) => {
  const [mode, setMode] = useState<CaptureMode>('camera');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureSessionKey, setCaptureSessionKey] = useState(0);
  const [autoSeconds, setAutoSeconds] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef(false);

  const isFullbody = true; // always full body on /display
  const facingMode = 'environment' as const; // always rear camera on /display
  const isCamera = mode === 'camera';

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    capturedRef.current = false;
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      // Always use the external/environment (rear) camera on the display screen
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setIsLoading(false);
    } catch {
      // Fallback: try without exact constraint in case device only has one camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 4096 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setIsLoading(false);
      } catch (err) {
        console.error('Camera error:', err);
        setError('Unable to access camera. Please grant camera permissions.');
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, startCamera]);

  // Auto countdown for full body
  useEffect(() => {
    if (!isFullbody || !isCamera || isLoading || !!error) return;
    setAutoSeconds(AUTO_CAPTURE_SECONDS);
    capturedRef.current = false;
    timerRef.current = setInterval(() => {
      setAutoSeconds(prev => {
        if (prev === null || prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isFullbody, isCamera, isLoading, error]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || capturedRef.current) return;
    capturedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // No mirroring — always environment/rear camera on display
      ctx.drawImage(video, 0, 0);
      setCapturedPhoto(canvas.toDataURL('image/png'));
      setMode('preview');
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
  }, []);

  // Face alignment for selfie
  const { alignmentStatus, countdown, holdProgress, detectorReady } = useFaceAlignment(
    videoRef,
    handleCapture,
    !isFullbody && isCamera && !isLoading && !error && captureSessionKey >= 0
  );

  // Auto fire capture when countdown hits 0 (fullbody)
  useEffect(() => {
    if (isFullbody && autoSeconds === 0 && !capturedRef.current) handleCapture();
  }, [autoSeconds, isFullbody, handleCapture]);

  const handleRetake = () => {
    setCapturedPhoto(null);
    capturedRef.current = false;
    if (isFullbody) setAutoSeconds(AUTO_CAPTURE_SECONDS);
    setCaptureSessionKey(k => k + 1);
    setMode('camera');
  };

  // Selfie is captured on kiosk — DisplayCaptureFlow only handles full body

  const handleConfirmFullBody = useCallback(async () => {
    if (!capturedPhoto || isSaving) return;
    setIsSaving(true);
    try {
      const url = await uploadImageToStorage(capturedPhoto, sessionToken, 'fullbody');
      if (!url) {
        console.error('[DisplayCapture] Image upload failed — no signed URL returned');
        setError('Failed to upload photo. Please retake.');
        setIsSaving(false);
        return;
      }

      const updated = await updateSessionField(sessionToken, { full_body_url: url });
      if (!updated) {
        console.error('[DisplayCapture] DB update failed for full_body_url');
        setError('Failed to save photo. Please retake.');
        setIsSaving(false);
        return;
      }

      // Persist to sessionStorage for kiosk cross-route use
      sessionStorage.setItem('vto_full_body', capturedPhoto);
      sessionStorage.setItem('vto_session_id', sessionId);
      sessionStorage.setItem('vto_session_token', sessionToken);
      onComplete();
    } catch (err) {
      console.error('Error saving full body:', err);
      setError('Something went wrong. Please retake.');
      setIsSaving(false);
    }
  }, [capturedPhoto, isSaving, sessionToken, sessionId, onComplete]);

  // Preview state — always full body on /display
  if (mode === 'preview' && capturedPhoto) {
    return (
      <AutoConfirmOverlay
        photo={capturedPhoto}
        onRetake={handleRetake}
        onConfirm={handleConfirmFullBody}
        isSaving={isSaving}
        label="Full body photo"
      />
    );
  }

  // Camera view
  return (
    <>
      <style>{`
        @keyframes countPop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>

      <div className="fixed inset-0 bg-background flex flex-col animate-fade-in">
        {/* Phase indicator */}
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-center pt-4 pointer-events-none">
          <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/20">
            <img src={trendsLogo} alt="Trends" className="h-5 object-contain brightness-0 invert opacity-80" />
            <span className="text-white/70 text-xs font-medium">
              {isFullbody ? 'Step 2 of 2 · Full Body' : 'Step 1 of 2 · Selfie'}
            </span>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted
            className={cn('w-full h-full object-cover transition-opacity duration-300',
              isLoading ? 'opacity-0' : 'opacity-100')} />
          <canvas ref={canvasRef} className="hidden" />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground font-medium">Starting camera…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted p-8">
              <div className="text-center rounded-3xl bg-card border border-border p-8 max-w-md">
                <p className="text-destructive text-lg mb-4">{error}</p>
              </div>
            </div>
          )}

          {/* Selfie: oval guide */}
          {!isFullbody && !isLoading && !error && (
            <OvalGuide status={detectorReady ? alignmentStatus : 'loading'} countdown={countdown} holdProgress={holdProgress} />
          )}
          {!isFullbody && !isLoading && !error && countdown !== null && (
            <CountdownOverlay countdown={countdown} />
          )}

          {/* Full body: rectangle guide */}
          {isFullbody && !isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-[28rem]">
                <div className="absolute inset-0 border-2 border-white/50 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <div className="absolute inset-0 flex items-center justify-center opacity-25">
                    <PersonStanding className="w-24 h-24 text-white" />
                  </div>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl" />
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="absolute top-16 left-0 right-0 text-center px-8 z-10 pointer-events-none">
            <h2 className="text-3xl font-display font-semibold text-white drop-shadow-lg mb-2 mt-6">
              {isFullbody ? 'Stand back for a full body shot' : 'Position your face in the oval'}
            </h2>
            <p className="text-white/70 text-lg drop-shadow">
              {isFullbody ? 'Head-to-toe · face the camera' : 'Auto-capture when aligned · or tap below'}
            </p>
          </div>

          {/* Selfie hint pill */}
          {!isFullbody && !isLoading && !error && (
            <HintPill status={detectorReady ? alignmentStatus : 'loading'} countdown={countdown} />
          )}

          {/* Full body auto-timer */}
          {isFullbody && !isLoading && !error && autoSeconds !== null && (
            <AutoTimerPill seconds={autoSeconds} onCaptureNow={handleCapture} />
          )}

          {/* Top controls — camera switch removed; always rear camera on display */}
        </div>

        {/* Shutter */}
        <div className="absolute bottom-0 left-0 right-0 pb-12 pt-8 flex justify-center z-10">
          <button onClick={handleCapture} disabled={isLoading || !!error}
            className={cn('w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-90',
              'bg-white border-4 border-primary shadow-lg shadow-primary/30',
              'disabled:opacity-50 disabled:cursor-not-allowed')}
            aria-label="Capture photo">
            <div className="w-16 h-16 rounded-full bg-primary" />
          </button>
        </div>
      </div>
    </>
  );
};
