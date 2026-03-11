import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { cn } from '@/lib/utils';
import { X, SwitchCamera, RotateCcw, Loader2 } from 'lucide-react';
import { updateSessionSelfie } from '@/hooks/useVTOSession';
import { useFaceAlignment, AlignmentStatus } from '@/hooks/useFaceAlignment';
import { toast } from 'sonner';

type CaptureMode = 'camera' | 'preview';

// ─── helpers ────────────────────────────────────────────────────────────────

function ovalStyle(status: AlignmentStatus, countdown: number | null): {
  stroke: string;
  glow: boolean;
  filter?: string;
} {
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
const OvalGuide: React.FC<{
  status: AlignmentStatus;
  countdown: number | null;
  holdProgress: number;
}> = ({ status, countdown, holdProgress }) => {
  const { stroke, glow, filter } = ovalStyle(status, countdown);
  const isAligned = status === 'aligned' || countdown !== null;
  const cx = 50; const cy = 46; const rx = 30; const ry = 38;
  const circumference = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  const progressOffset = circumference - (holdProgress / 100) * circumference;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ filter: filter ?? undefined }}
    >
      <defs>
        <mask id="oval-mask">
          <rect width="100" height="100" fill="white" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
        </mask>
        {glow && (
          <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <rect width="100" height="100" fill="rgba(0,0,0,0.45)" mask="url(#oval-mask)" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth="0.8"
        className="transition-all duration-300" style={{ filter: glow ? 'url(#glow-filter)' : undefined }} />
      {isAligned && countdown === null && (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#22c55e" strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${progressOffset}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-[stroke-dashoffset] duration-100 ease-linear" />
      )}
      {['tl','tr','bl','br'].map(corner => {
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

// ─── Countdown overlay ──────────────────────────────────────────────────────
const CountdownOverlay: React.FC<{ countdown: number }> = ({ countdown }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <div
      key={countdown}
      className="text-white font-black drop-shadow-2xl select-none"
      style={{
        fontSize: 'clamp(5rem, 20vw, 9rem)',
        animation: 'countPop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        textShadow: '0 0 40px rgba(34,197,94,0.8)',
      }}
    >
      {countdown === 0 ? '📸' : countdown}
    </div>
  </div>
);

// ─── Status hint pill ───────────────────────────────────────────────────────
const HintPill: React.FC<{ status: AlignmentStatus; countdown: number | null }> = ({ status, countdown }) => {
  const isGreen = status === 'aligned' || countdown !== null;
  const text = countdown !== null && countdown > 0
    ? `📸 Capturing in ${countdown}…`
    : countdown === 0
    ? '📸 Capturing…'
    : hintText(status);

  return (
    <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none px-6">
      <div className={cn(
        'flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-md text-white text-sm font-semibold shadow-lg transition-all duration-300',
        isGreen
          ? 'bg-green-500/30 border border-green-400/50 shadow-green-500/20'
          : status === 'loading' || status === 'no_face'
          ? 'bg-black/40 border border-white/20'
          : 'bg-red-500/30 border border-red-400/50 shadow-red-500/20'
      )}>
        {text}
      </div>
    </div>
  );
};

// ─── Auto-confirm overlay ────────────────────────────────────────────────────
// Shown after capture: counts down 2s then auto-saves. User can tap Retake.
const AutoConfirmOverlay: React.FC<{
  photo: string;
  onRetake: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}> = ({ photo, onRetake, onConfirm, isSaving }) => {
  const [remaining, setRemaining] = useState(2);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(onConfirm, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 bg-background flex flex-col animate-fade-in">
      <div className="flex-1 relative">
        <img src={photo} alt="Captured selfie" className="w-full h-full object-contain" />
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
          {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : null}
          {isSaving ? 'Saving…' : 'Use Now'}
        </button>
      </div>
    </div>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────
export const SelfieCaptureStep: React.FC = () => {
  const { setCapturedImages, capturedImages, setCurrentStep, sessionId, sessionToken } = useVTO();
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  // Always start directly in camera mode — skip the options screen
  const [mode, setMode]               = useState<CaptureMode>('camera');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode]   = useState<'user' | 'environment'>('user');
  const [isLoading, setIsLoading]     = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [captureSessionKey, setCaptureSessionKey] = useState(0);

  const isCamera = mode === 'camera';

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 4096 }, height: { ideal: 4096 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please grant camera permissions.');
      setIsLoading(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [mode, startCamera]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0);
      const photo = canvas.toDataURL('image/png');
      setCapturedPhoto(photo);
      setMode('preview');
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
  }, [facingMode]);

  const { alignmentStatus, countdown, holdProgress, detectorReady } = useFaceAlignment(
    videoRef,
    handleCapture,
    isCamera && !isLoading && !error && captureSessionKey >= 0
  );

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCaptureSessionKey(k => k + 1);
    setMode('camera');
  };

  const handleCancel = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setCurrentStep(1);
  };

  const handleUsePhoto = useCallback(async () => {
    if (!capturedPhoto || isSaving) return;
    setIsSaving(true);
    try {
      if (sessionId && sessionToken) await updateSessionSelfie(sessionId, sessionToken, capturedPhoto);
      setCapturedImages({ ...capturedImages, selfie: capturedPhoto });
      // Advance to big screen handoff
      setCurrentStep(2.75 as 2.75);
    } catch (err) {
      console.error('Error saving selfie:', err);
      toast.error('Failed to save photo. Please try again.');
      setIsSaving(false);
    }
  }, [capturedPhoto, isSaving, sessionId, sessionToken, capturedImages, setCapturedImages, setCurrentStep]);

  // ── Preview: show auto-confirm overlay ─────────────────────────────────
  if (mode === 'preview' && capturedPhoto) {
    return (
      <AutoConfirmOverlay
        photo={capturedPhoto}
        onRetake={handleRetake}
        onConfirm={handleUsePhoto}
        isSaving={isSaving}
      />
    );
  }

  // ── Camera view ────────────────────────────────────────────────────────
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
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted
            className={cn('w-full h-full object-cover transition-opacity duration-300',
              isLoading ? 'opacity-0' : 'opacity-100',
              facingMode === 'user' && 'scale-x-[-1]')} />
          <canvas ref={canvasRef} className="hidden" />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground font-medium">Starting camera…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted p-8">
              <div className="text-center glass-card rounded-3xl p-8 max-w-md">
                <p className="text-destructive text-lg mb-4">{error}</p>
                <button onClick={handleCancel} className="btn-primary-vto">Go Back</button>
              </div>
            </div>
          )}

          {!isLoading && !error && (
            <OvalGuide
              status={detectorReady ? alignmentStatus : 'loading'}
              countdown={countdown}
              holdProgress={holdProgress}
            />
          )}

          {!isLoading && !error && countdown !== null && (
            <CountdownOverlay countdown={countdown} />
          )}

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
            <button onClick={handleCancel}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl text-white font-medium transition-all hover:bg-white/20 active:scale-95">
              <X className="w-5 h-5" /> Cancel
            </button>
            <button onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')}
              className="p-4 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl text-white transition-all hover:bg-white/20 active:scale-95"
              aria-label="Switch camera">
              <SwitchCamera className="w-6 h-6" />
            </button>
          </div>

          {/* Instructions */}
          <div className="absolute top-24 left-0 right-0 text-center px-8 z-10 pointer-events-none">
            <h2 className="text-2xl font-display font-semibold text-white drop-shadow-lg mb-1">
              Position your face in the oval
            </h2>
            <p className="text-white/70 text-base drop-shadow">
              Auto-capture when aligned · or tap below
            </p>
          </div>

          {!isLoading && !error && (
            <HintPill status={detectorReady ? alignmentStatus : 'loading'} countdown={countdown} />
          )}
        </div>

        {/* Manual shutter */}
        <div className="absolute bottom-0 left-0 right-0 pb-12 pt-8 flex justify-center z-10">
          <button
            onClick={handleCapture}
            disabled={isLoading || !!error}
            className={cn(
              'w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-90',
              'bg-white border-4 border-primary shadow-lg shadow-primary/30',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            aria-label="Capture photo"
          >
            <div className="w-16 h-16 rounded-full bg-primary" />
          </button>
        </div>
      </div>
    </>
  );
};
