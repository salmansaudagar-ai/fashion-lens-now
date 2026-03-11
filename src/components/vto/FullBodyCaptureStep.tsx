import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { cn } from '@/lib/utils';
import { SwitchCamera, RotateCcw, X, Loader2, PersonStanding } from 'lucide-react';
import { updateSessionFullBody } from '@/hooks/useVTOSession';
import { toast } from 'sonner';

type CaptureMode = 'camera' | 'preview';

const AUTO_CAPTURE_SECONDS = 5;

// ─── Auto-timer pill ─────────────────────────────────────────────────────────
const AutoTimerPill: React.FC<{ seconds: number; onCaptureNow: () => void }> = ({ seconds, onCaptureNow }) => (
  <div className="absolute bottom-36 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none px-6">
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg width="80" height="80" className="rotate-[-90deg] absolute inset-0">
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
        <circle
          cx="40" cy="40" r="34"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 34}`}
          strokeDashoffset={`${2 * Math.PI * 34 * (seconds / AUTO_CAPTURE_SECONDS)}`}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        key={seconds}
        className="text-3xl font-black text-white drop-shadow-lg z-10"
        style={{ animation: 'countPop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {seconds > 0 ? seconds : '📸'}
      </span>
    </div>
    <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-sm font-semibold pointer-events-auto"
      onClick={onCaptureNow}
      style={{ cursor: 'pointer' }}
    >
      📸 {seconds > 0 ? `Auto-capture in ${seconds}s · Tap to capture now` : 'Capturing…'}
    </div>
  </div>
);

// ─── Auto-confirm overlay ─────────────────────────────────────────────────────
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
        <img src={photo} alt="Captured full body" className="w-full h-full object-contain" />
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

// ─── Main component ──────────────────────────────────────────────────────────
export const FullBodyCaptureStep: React.FC = () => {
  const { setCapturedImages, capturedImages, setCurrentStep, sessionId, sessionToken } = useVTO();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Always start in camera mode — skip options screen
  const [mode, setMode]               = useState<CaptureMode>('camera');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode]   = useState<'user' | 'environment'>('environment');
  const [isLoading, setIsLoading]     = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [autoSeconds, setAutoSeconds] = useState<number | null>(null);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef(false);

  const isCamera = mode === 'camera';

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    capturedRef.current = false;
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 4096 }, height: { ideal: 4096 }, aspectRatio: { ideal: 9 / 16 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please grant camera permissions.');
      setIsLoading(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, startCamera]);

  // Auto countdown once camera is ready
  useEffect(() => {
    if (!isCamera || isLoading || !!error) return;
    setAutoSeconds(AUTO_CAPTURE_SECONDS);
    capturedRef.current = false;
    timerRef.current = setInterval(() => {
      setAutoSeconds(prev => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isCamera, isLoading, error]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || capturedRef.current) return;
    capturedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0);
      setCapturedPhoto(canvas.toDataURL('image/png'));
      setMode('preview');
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
  }, [facingMode]);

  // Fire capture when countdown reaches 0
  useEffect(() => {
    if (autoSeconds === 0 && !capturedRef.current) handleCapture();
  }, [autoSeconds, handleCapture]);

  const handleRetake = () => {
    setCapturedPhoto(null);
    capturedRef.current = false;
    setMode('camera');
  };

  const handleUsePhoto = useCallback(async () => {
    if (!capturedPhoto || isSaving) return;
    setIsSaving(true);
    try {
      if (sessionId && sessionToken) await updateSessionFullBody(sessionId, sessionToken, capturedPhoto);
      // Persist to sessionStorage so ProductDetail can trigger generation cross-route
      sessionStorage.setItem('vto_full_body', capturedPhoto);
      // Persist session tokens so they survive VTOProvider remount after navigation
      if (sessionId) sessionStorage.setItem('vto_session_id', sessionId);
      if (sessionToken) sessionStorage.setItem('vto_session_token', sessionToken);
      setCapturedImages({ ...capturedImages, fullBody: capturedPhoto });
      setCurrentStep(3);
    } catch (err) {
      console.error('Error saving full body photo:', err);
      toast.error('Failed to save photo. Please try again.');
      setIsSaving(false);
    }
  }, [capturedPhoto, isSaving, sessionId, sessionToken, capturedImages, setCapturedImages, setCurrentStep]);

  const handleBack = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentStep(2.75 as 2.75);
  };

  // ── Preview: auto-confirm overlay ────────────────────────────────────────
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

  // ── Camera view ───────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes countPop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
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
                <button onClick={handleBack} className="btn-primary-vto">Go Back</button>
              </div>
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background/70 via-transparent to-background/50" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
            <button onClick={handleBack}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl text-white font-medium transition-all hover:bg-white/20 active:scale-95">
              <X className="w-5 h-5" /> Back
            </button>
            <button onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')}
              className="p-4 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl text-white transition-all hover:bg-white/20 active:scale-95"
              aria-label="Switch camera">
              <SwitchCamera className="w-6 h-6" />
            </button>
          </div>

          {/* Instructions */}
          <div className="absolute top-24 left-0 right-0 text-center px-8 z-10 pointer-events-none">
            <h2 className="text-2xl font-display font-semibold text-white drop-shadow-lg mb-2">
              Stand back for a full body shot
            </h2>
            <p className="text-white/80 text-lg drop-shadow">
              Head-to-toe · face the camera
            </p>
          </div>

          {/* Full body guide frame */}
          {!isLoading && !error && (
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

          {/* Auto-timer pill */}
          {!isLoading && !error && autoSeconds !== null && (
            <AutoTimerPill seconds={autoSeconds} onCaptureNow={handleCapture} />
          )}
        </div>

        {/* Manual shutter */}
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
