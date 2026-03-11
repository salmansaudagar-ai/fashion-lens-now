import { useEffect, useRef, useState, useCallback } from 'react';

export type AlignmentStatus =
  | 'loading'
  | 'no_face'
  | 'too_far'
  | 'too_close'
  | 'off_centre'
  | 'aligned';

export interface FaceAlignmentState {
  alignmentStatus: AlignmentStatus;
  countdown: number | null;   // 3 → 2 → 1 → 0 then capture
  holdProgress: number;       // 0–100 while in hold phase
  detectorReady: boolean;
}

// ─── tuneable constants ────────────────────────────────────────────────────
const HOLD_FRAMES      = 24;   // ~0.8 s at 30 fps before countdown starts
const COUNTDOWN_FROM   = 3;    // seconds
const MIN_AREA_RATIO   = 0.18; // face must fill ≥ 18 % of oval area  (was 0.35)
const MAX_AREA_RATIO   = 2.2;  // face must fill ≤ 220 % of oval area (was 1.6)
const MAX_OFFSET_RATIO = 0.55; // face centre may deviate ≤ 55 % of oval radius (was 0.22)
// ──────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapi: any;
  }
}

let faceApiLoadPromise: Promise<void> | null = null;

function loadFaceApi(): Promise<void> {
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = new Promise((resolve, reject) => {
    if (window.faceapi) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
    script.crossOrigin = 'anonymous';
    script.onload = async () => {
      try {
        const MODEL_URL =
          'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        resolve();
      } catch (e) { reject(e); }
    };
    script.onerror = () => reject(new Error('face-api.js load error'));
    document.head.appendChild(script);
  });
  return faceApiLoadPromise;
}

// Oval zone in normalised coords (0–1) relative to the video element
const OVAL = { cx: 0.5, cy: 0.46, rx: 0.30, ry: 0.38 };

function computeAlignment(
  faceBox: { x: number; y: number; width: number; height: number },
  videoW: number,
  videoH: number
): AlignmentStatus {
  // Normalise face box
  const faceCx = (faceBox.x + faceBox.width / 2) / videoW;
  const faceCy = (faceBox.y + faceBox.height / 2) / videoH;
  const faceW  = faceBox.width  / videoW;
  const faceH  = faceBox.height / videoH;

  const ovalArea = Math.PI * OVAL.rx * OVAL.ry;
  const faceArea = faceW * faceH;
  const areaRatio = faceArea / ovalArea;

  const dx = Math.abs(faceCx - OVAL.cx) / OVAL.rx;
  const dy = Math.abs(faceCy - OVAL.cy) / OVAL.ry;
  const offsetRatio = Math.sqrt(dx * dx + dy * dy);

  if (areaRatio < MIN_AREA_RATIO) return 'too_far';
  if (areaRatio > MAX_AREA_RATIO) return 'too_close';
  if (offsetRatio > MAX_OFFSET_RATIO) return 'off_centre';
  return 'aligned';
}

export function useFaceAlignment(
  videoRef: React.RefObject<HTMLVideoElement>,
  onCapture: () => void,
  enabled: boolean = true
): FaceAlignmentState {
  const [alignmentStatus, setAlignmentStatus] = useState<AlignmentStatus>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [detectorReady, setDetectorReady] = useState(false);

  const rafRef         = useRef<number>(0);
  const holdFramesRef  = useRef(0);
  const countdownRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedRef    = useRef(false);
  const lastTimeRef    = useRef(-1);
  // shadow-copy of countdown for use inside rAF without stale closure
  const countdownStateRef = useRef<number | null>(null);

  const clearCountdownTimer = useCallback(() => {
    if (countdownRef.current) { clearTimeout(countdownRef.current); countdownRef.current = null; }
  }, []);

  const resetHold = useCallback(() => {
    holdFramesRef.current = 0;
    setHoldProgress(0);
    setCountdown(null);
    countdownStateRef.current = null;
    clearCountdownTimer();
    capturedRef.current = false;
  }, [clearCountdownTimer]);

  const triggerCountdown = useCallback(() => {
    let count = COUNTDOWN_FROM;
    setCountdown(count);
    countdownStateRef.current = count;

    const tick = () => {
      count -= 1;
      setCountdown(count);
      countdownStateRef.current = count;
      if (count <= 0) {
        setHoldProgress(100);
        if (!capturedRef.current) {
          capturedRef.current = true;
          onCapture();
        }
      } else {
        countdownRef.current = setTimeout(tick, 1000);
      }
    };
    countdownRef.current = setTimeout(tick, 1000);
  }, [onCapture]);

  // ── Load detector ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let destroyed = false;

    const init = async () => {
      try {
        // Try native FaceDetector first (Chrome / Android)
        if ('FaceDetector' in window) {
          setDetectorReady(true);
          setAlignmentStatus('no_face');
          return;
        }
        // Fallback: face-api.js tiny detector
        await loadFaceApi();
        if (destroyed) return;
        setDetectorReady(true);
        setAlignmentStatus('no_face');
      } catch (err) {
        console.error('Face detector init failed:', err);
        // Gracefully degrade — just let user manually capture
        setDetectorReady(true);
        setAlignmentStatus('no_face');
      }
    };

    init();
    return () => {
      destroyed = true;
      cancelAnimationFrame(rafRef.current);
      clearCountdownTimer();
      setDetectorReady(false);
      setAlignmentStatus('loading');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── Detection loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!detectorReady || !enabled) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nativeDetector: any = null;
    if ('FaceDetector' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nativeDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    }

    const detect = async () => {
      const video = videoRef.current;
      if (
        !video ||
        video.readyState < 2 ||
        video.paused ||
        video.currentTime === lastTimeRef.current
      ) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTimeRef.current = video.currentTime;

      try {
        let faceBox: { x: number; y: number; width: number; height: number } | null = null;

        if (nativeDetector) {
          const faces = await nativeDetector.detect(video);
          if (faces.length > 0) {
            const { x, y, width, height } = faces[0].boundingBox;
            faceBox = { x, y, width, height };
          }
        } else if (window.faceapi) {
          const result = await window.faceapi.detectSingleFace(
            video,
            new window.faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 })
          );
          if (result) faceBox = result.box;
        }

        if (!faceBox) {
          setAlignmentStatus('no_face');
          if (countdownStateRef.current === null) resetHold();
          rafRef.current = requestAnimationFrame(detect);
          return;
        }

        const status = computeAlignment(faceBox, video.videoWidth, video.videoHeight);
        setAlignmentStatus(status);

        if (status === 'aligned') {
          holdFramesRef.current = Math.min(holdFramesRef.current + 1, HOLD_FRAMES);
          const prog = (holdFramesRef.current / HOLD_FRAMES) * 100;
          setHoldProgress(prog);

          if (holdFramesRef.current >= HOLD_FRAMES && countdownStateRef.current === null && !capturedRef.current) {
            triggerCountdown();
          }
        } else {
          // Only reset hold if countdown hasn't started yet (don't interrupt a running countdown)
          if (countdownStateRef.current === null && !capturedRef.current) {
            // Decay hold frames slowly instead of instant reset for smoother UX
            holdFramesRef.current = Math.max(0, holdFramesRef.current - 2);
            setHoldProgress((holdFramesRef.current / HOLD_FRAMES) * 100);
          }
        }
      } catch (_) {
        // Silently swallow per-frame errors
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [detectorReady, enabled, resetHold, triggerCountdown, videoRef]);

  return { alignmentStatus, countdown, holdProgress, detectorReady };
}
