import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MediaPipeTasksVision: any;
  }
}

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const PALM_HOLD_FRAMES = 40; // ~1.5s at 30fps
const COUNTDOWN_FROM = 3;

export interface PalmGestureState {
  palmDetected: boolean;
  countdown: number | null;
  gestureReady: boolean;
  progress: number; // 0–100
}

let scriptLoadPromise: Promise<void> | null = null;

function loadMediaPipeScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.MediaPipeTasksVision) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      // The bundle attaches itself to window as MediaPipeTasksVision
      if (window.MediaPipeTasksVision) {
        resolve();
      } else {
        // Some versions expose it differently
        resolve();
      }
    };
    script.onerror = () => reject(new Error('Failed to load MediaPipe script'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function usePalmGesture(
  videoRef: React.RefObject<HTMLVideoElement>,
  onCapture: () => void,
  enabled: boolean = true
): PalmGestureState {
  const [palmDetected, setPalmDetected] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gestureReady, setGestureReady] = useState(false);
  const [progress, setProgress] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const palmFramesRef = useRef(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const capturedRef = useRef(false);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    setProgress(0);
    capturedRef.current = false;
  }, []);

  const triggerCountdown = useCallback(() => {
    let count = COUNTDOWN_FROM;
    setCountdown(count);

    const tick = () => {
      count -= 1;
      if (count <= 0) {
        setCountdown(0);
        setProgress(100);
        if (!capturedRef.current) {
          capturedRef.current = true;
          onCapture();
        }
      } else {
        setCountdown(count);
        countdownTimerRef.current = setTimeout(tick, 1000);
      }
    };

    countdownTimerRef.current = setTimeout(tick, 1000);
  }, [onCapture]);

  useEffect(() => {
    if (!enabled) return;

    let destroyed = false;

    const init = async () => {
      try {
        await loadMediaPipeScript();
        if (destroyed) return;

        // The bundle may be at window.MediaPipeTasksVision or window (older versions)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vision: any = window.MediaPipeTasksVision || window;
        const { FilesetResolver, GestureRecognizer } = vision;

        if (!FilesetResolver || !GestureRecognizer) {
          console.warn('MediaPipe GestureRecognizer not available');
          return;
        }

        const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
        if (destroyed) return;

        const recognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: GESTURE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });

        if (destroyed) {
          recognizer.close();
          return;
        }

        recognizerRef.current = recognizer;
        setGestureReady(true);
      } catch (err) {
        console.error('Failed to initialize palm gesture recognizer:', err);
      }
    };

    init();

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafRef.current);
      clearCountdown();
      if (recognizerRef.current) {
        try { recognizerRef.current.close(); } catch (_) { /* ignore */ }
        recognizerRef.current = null;
      }
      setGestureReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Detection loop — starts once recognizer is ready and video is playing
  useEffect(() => {
    if (!gestureReady || !enabled) return;

    const detect = () => {
      const video = videoRef.current;
      const recognizer = recognizerRef.current;

      if (
        video &&
        recognizer &&
        video.readyState >= 2 &&
        !video.paused &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;

        try {
          const results = recognizer.recognizeForVideo(video, performance.now());
          const gestures = results?.gestures ?? [];
          const isOpenPalm =
            gestures.length > 0 &&
            gestures[0]?.[0]?.categoryName === 'Open_Palm' &&
            (gestures[0]?.[0]?.score ?? 0) > 0.75;

          if (isOpenPalm) {
            palmFramesRef.current += 1;
            const prog = Math.min((palmFramesRef.current / PALM_HOLD_FRAMES) * 100, 100);
            setProgress(prog);
            setPalmDetected(true);

            if (palmFramesRef.current >= PALM_HOLD_FRAMES && countdown === null && !capturedRef.current) {
              triggerCountdown();
            }
          } else {
            if (palmFramesRef.current > 0) {
              palmFramesRef.current = 0;
              setProgress(0);
              setPalmDetected(false);
              // Only reset countdown if it hasn't started yet (still in hold phase)
              if (countdown === null) {
                clearCountdown();
              }
            }
          }
        } catch (_) {
          // Silently ignore per-frame errors
        }
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gestureReady, enabled, countdown, triggerCountdown, clearCountdown, videoRef]);

  return { palmDetected, countdown, gestureReady, progress };
}
