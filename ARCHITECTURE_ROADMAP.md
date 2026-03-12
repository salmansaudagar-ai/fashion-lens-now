# Fashion Lens — Full Product Journey & Architecture

## End Goal
A Reliance Trends kiosk where a customer walks in, tries clothes virtually in <5 seconds with photorealistic accuracy, gets body measurements predicted, and sees a short video of themselves wearing the outfit.

---

## Journey: 3 Phases

### Phase 1: Virtual Try-On Image (CURRENT PRIORITY)
**Target:** <5 sec, 100% garment accuracy, photorealistic

| Model | Status | Quality | Speed | VRAM | Finetuneable | Verdict |
|-------|--------|---------|-------|------|-------------|---------|
| Vertex AI | ✅ Working | Good | ~3s | Cloud | ❌ No control | Keep as baseline |
| IDM-VTON | ⚠️ Poor quality | Low | ~15s | 12GB+ | ✅ LoRA possible | Replace |
| OmniGen2 | ❌ Can't run on T4 | Unknown | - | 20GB+ | - | Drop |
| **CatVTON-FLUX** | 🎯 **RECOMMENDED** | **SOTA** | **~5s** | **<8GB** | **✅ 37M LoRA** | **New primary** |
| FASHN VTON v1.5 | Alternative | High | ~5s (H100) | <8GB | ✅ Apache 2.0 | Backup option |

**Why CatVTON-FLUX wins:**
- SOTA FID score (5.59) on VITON-HD benchmark
- Runs on T4 GPU (<8GB VRAM) — fits FREE Colab
- LoRA is only 37.4M params — finetune with 20+ images on a single GPU
- Built on FLUX.1-Fill-dev (best inpainting model available)
- Single UNet architecture = faster than dual-UNet models (IDM-VTON)

### Phase 2: Body Measurement Prediction
**Target:** Predict chest, waist, hip, inseam, shoulder width from photo

| Approach | How It Works | Accuracy |
|----------|-------------|----------|
| MediaPipe Pose + MiDaS Depth | Detect 33 body landmarks + depth estimation, calibrate with reference object | ±2-3cm |
| SMPL/SMPL-X Body Model | Fit parametric 3D body model to photo, extract measurements from mesh | ±1-2cm |
| Direct Regression CNN | Train CNN to predict measurements from silhouette | ±2-4cm |

**Recommended:** MediaPipe + reference calibration (height input from user) — no special hardware needed, runs on any device, can be done client-side or server-side.

### Phase 3: Video Generation
**Target:** 5-10 sec clip of person walking/turning in the outfit

| Approach | Model | Status |
|----------|-------|--------|
| Image-to-Video | fal.ai PixVerse (current) | ✅ Integrated |
| VTO-specific Video | ViViD (Alibaba, open source) | Available, needs A100 |
| Animation | Wan 2.2 / HunyuanVideo | Available, needs A100 |

**Current fal.ai approach works for MVP.** Upgrade to ViViD for production-quality cloth-aware video later.

---

## Implementation Plan

### NOW: Replace IDM-VTON with CatVTON-FLUX
1. Create new Colab notebook: `CatVTON_FLUX_Server.ipynb`
2. Install dependencies (diffusers, FLUX, LoRA weights)
3. Load CatVTON-FLUX LoRA on FLUX.1-Fill-dev
4. Expose Gradio API with same interface as IDM-VTON
5. Update edge function to call CatVTON-FLUX
6. Test on compare page

### NEXT: Add Body Measurement
1. Add MediaPipe Pose detection to full-body capture step
2. Ask user for height (reference measurement)
3. Calculate proportional body measurements
4. Display size recommendation with try-on result

### LATER: Upgrade Video
1. Evaluate ViViD quality vs fal.ai
2. If better, deploy ViViD on cloud GPU
3. Integrate into pipeline

---

## Current Architecture (What Exists)

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Tablet (/)  │────▶│  Display     │────▶│  Compare      │
│  Customer    │     │  (/display)  │     │  (/compare)   │
│  Kiosk       │     │  Big Screen  │     │  Admin View   │
└──────┬───────┘     └──────────────┘     └───────────────┘
       │
       ▼
┌──────────────────────────────────┐
│  Supabase Edge Function          │
│  generate-virtual-tryon          │
│                                  │
│  ┌─────────┐ ┌─────────┐ ┌────┐│
│  │CatVTON  │ │Vertex AI│ │360 ││
│  │(Colab)  │ │(GCloud) │ │Vid ││
│  └─────────┘ └─────────┘ └────┘│
└──────────────────────────────────┘
```

## Supabase Secrets Needed
- `IDM_VTON_COLAB_URL` → rename to `CATVTON_COLAB_URL`
- `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON` (Vertex AI)
- `FAL_API_KEY` (video generation)
- `ANTHROPIC_API_KEY` (optional, AI judge)
