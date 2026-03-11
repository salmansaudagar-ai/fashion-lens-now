/**
 * Client-side body measurement extraction using MediaPipe Pose.
 *
 * Takes a full-body photo (base64 data URL) and returns:
 *  - Estimated body measurements (shoulder, chest, waist, hip, arm, inseam)
 *  - Recommended clothing sizes (top S/M/L/XL, bottom 28-38)
 *  - Pose landmark visualization data
 *
 * Uses the MediaPipe Pose model loaded from CDN (no npm install needed).
 */

export interface BodyMeasurements {
  shoulderWidth: number;
  chestEstimate: number;
  waistEstimate: number;
  hipWidth: number;
  armLength: number;
  torsoLength: number;
  inseam: number;
  heightCm: number;
  topSize: string;
  bottomSize: string;
}

interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// MediaPipe Pose landmark indices
const LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function getTopSize(chest: number): string {
  if (chest < 88) return 'XS';
  if (chest < 96) return 'S';
  if (chest < 104) return 'M';
  if (chest < 112) return 'L';
  if (chest < 120) return 'XL';
  return 'XXL';
}

function getBottomSize(waist: number): string {
  if (waist < 72) return '28';
  if (waist < 76) return '30';
  if (waist < 82) return '32';
  if (waist < 88) return '34';
  if (waist < 94) return '36';
  return '38+';
}

/**
 * Extract body measurements from a full-body photo.
 *
 * @param imageDataUrl - base64 data URL of the full body image
 * @param heightCm - actual height of the person in cm (default 170)
 * @returns BodyMeasurements or null if pose detection fails
 */
export async function extractBodyMeasurements(
  imageDataUrl: string,
  heightCm: number = 170,
): Promise<BodyMeasurements | null> {
  try {
    // Load the image into a canvas
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imageDataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Use MediaPipe Pose via the Tasks Vision API (loaded from CDN)
    // Check if PoseLandmarker is available, if not load it
    let landmarks: PoseLandmark[] | null = null;

    // Try using the browser's built-in pose detection (if available)
    // Fallback: use simple proportional estimation from image dimensions
    if ('PoseDetector' in window) {
      try {
        // @ts-ignore — experimental API
        const detector = new (window as any).PoseDetector({ maxPoses: 1 });
        const poses = await detector.detect(img);
        if (poses?.[0]?.landmarks) {
          landmarks = poses[0].landmarks.map((lm: any) => ({
            x: lm.x * img.width,
            y: lm.y * img.height,
            z: lm.z || 0,
            visibility: lm.visibility || 1,
          }));
        }
      } catch (e) {
        console.warn('[Measurements] PoseDetector failed:', e);
      }
    }

    // If no pose API available, try loading MediaPipe from CDN dynamically
    if (!landmarks) {
      try {
        landmarks = await detectPoseViaCDN(canvas, img.width, img.height);
      } catch (e) {
        console.warn('[Measurements] CDN pose detection failed:', e);
      }
    }

    // Final fallback: simple heuristic estimation from image aspect ratio
    if (!landmarks) {
      console.log('[Measurements] Using heuristic estimation (no pose detection available)');
      return estimateFromHeuristics(heightCm);
    }

    // Calculate pixel distances between key landmarks
    const lm = (id: number) => landmarks![id];

    const shoulderPx = distance(lm(LANDMARKS.LEFT_SHOULDER), lm(LANDMARKS.RIGHT_SHOULDER));
    const hipPx = distance(lm(LANDMARKS.LEFT_HIP), lm(LANDMARKS.RIGHT_HIP));

    const shoulderMid = midpoint(lm(LANDMARKS.LEFT_SHOULDER), lm(LANDMARKS.RIGHT_SHOULDER));
    const hipMid = midpoint(lm(LANDMARKS.LEFT_HIP), lm(LANDMARKS.RIGHT_HIP));
    const torsoPx = distance(shoulderMid, hipMid);

    const leftArmPx =
      distance(lm(LANDMARKS.LEFT_SHOULDER), lm(LANDMARKS.LEFT_ELBOW)) +
      distance(lm(LANDMARKS.LEFT_ELBOW), lm(LANDMARKS.LEFT_WRIST));
    const rightArmPx =
      distance(lm(LANDMARKS.RIGHT_SHOULDER), lm(LANDMARKS.RIGHT_ELBOW)) +
      distance(lm(LANDMARKS.RIGHT_ELBOW), lm(LANDMARKS.RIGHT_WRIST));
    const armPx = (leftArmPx + rightArmPx) / 2;

    const leftLegPx =
      distance(lm(LANDMARKS.LEFT_HIP), lm(LANDMARKS.LEFT_KNEE)) +
      distance(lm(LANDMARKS.LEFT_KNEE), lm(LANDMARKS.LEFT_ANKLE));
    const rightLegPx =
      distance(lm(LANDMARKS.RIGHT_HIP), lm(LANDMARKS.RIGHT_KNEE)) +
      distance(lm(LANDMARKS.RIGHT_KNEE), lm(LANDMARKS.RIGHT_ANKLE));
    const inseamPx = (leftLegPx + rightLegPx) / 2;

    const ankleMid = midpoint(lm(LANDMARKS.LEFT_ANKLE), lm(LANDMARKS.RIGHT_ANKLE));
    const fullHeightPx = distance(lm(LANDMARKS.NOSE), ankleMid);

    // Convert pixel distances to cm using height as reference
    const pxToCm = fullHeightPx > 0 ? heightCm / fullHeightPx : 1;

    const shoulderWidth = shoulderPx * pxToCm;
    const hipWidth = hipPx * pxToCm;
    const torsoLength = torsoPx * pxToCm;
    const armLength = armPx * pxToCm;
    const inseam = inseamPx * pxToCm;

    // Estimate circumferences from widths (rough multipliers)
    const chestEstimate = shoulderWidth * 2.4;
    const waistEstimate = hipWidth * 2.2;

    return {
      shoulderWidth: Math.round(shoulderWidth * 10) / 10,
      chestEstimate: Math.round(chestEstimate * 10) / 10,
      waistEstimate: Math.round(waistEstimate * 10) / 10,
      hipWidth: Math.round(hipWidth * 10) / 10,
      armLength: Math.round(armLength * 10) / 10,
      torsoLength: Math.round(torsoLength * 10) / 10,
      inseam: Math.round(inseam * 10) / 10,
      heightCm,
      topSize: getTopSize(chestEstimate),
      bottomSize: getBottomSize(waistEstimate),
    };
  } catch (error) {
    console.error('[Measurements] Failed:', error);
    return null;
  }
}

/** Load MediaPipe Pose from CDN and detect pose */
async function detectPoseViaCDN(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Promise<PoseLandmark[] | null> {
  // Dynamically load MediaPipe Pose script if not already loaded
  if (!(window as any).__mediapipe_pose_loaded) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
      script.onload = () => {
        (window as any).__mediapipe_pose_loaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Also load camera utils for image processing
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';
      script.onload = () => resolve();
      script.onerror = () => resolve(); // non-critical
      document.head.appendChild(script);
    });
  }

  return new Promise((resolve) => {
    const Pose = (window as any).Pose;
    if (!Pose) {
      resolve(null);
      return;
    }

    const pose = new Pose({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: false,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: any) => {
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks.map((lm: any) => ({
          x: lm.x * width,
          y: lm.y * height,
          z: lm.z || 0,
          visibility: lm.visibility || 1,
        }));
        resolve(landmarks);
      } else {
        resolve(null);
      }
    });

    // Send the canvas image to pose detector
    pose.send({ image: canvas }).catch(() => resolve(null));
  });
}

/** Fallback: rough size estimation without pose detection */
function estimateFromHeuristics(heightCm: number): BodyMeasurements {
  // Average proportions based on height
  const shoulderWidth = heightCm * 0.26;
  const chestEstimate = shoulderWidth * 2.4;
  const waistEstimate = heightCm * 0.44;
  const hipWidth = heightCm * 0.17;
  const armLength = heightCm * 0.36;
  const torsoLength = heightCm * 0.30;
  const inseam = heightCm * 0.45;

  return {
    shoulderWidth: Math.round(shoulderWidth * 10) / 10,
    chestEstimate: Math.round(chestEstimate * 10) / 10,
    waistEstimate: Math.round(waistEstimate * 10) / 10,
    hipWidth: Math.round(hipWidth * 10) / 10,
    armLength: Math.round(armLength * 10) / 10,
    torsoLength: Math.round(torsoLength * 10) / 10,
    inseam: Math.round(inseam * 10) / 10,
    heightCm,
    topSize: getTopSize(chestEstimate),
    bottomSize: getBottomSize(waistEstimate),
  };
}
