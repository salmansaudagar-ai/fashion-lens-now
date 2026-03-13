# Virtual Try-On (VTO) System — Production Specs & Learnings

## Architecture Overview

```
[Kiosk Tablet /] → [Supabase Edge Function] → [3 Models in Parallel] → [Compare Page /compare]
                          ↓                          ↓
                   [Supabase Storage]         [AI Judge (Claude)]
                   [vto_sessions DB]          [Winner Selection]
```

## Models Configuration

### 1. CatVTON-FLUX (SOTA)
- **Model**: FLUX.1-Fill-dev (12B params) + CatVTON LoRA
- **GPU**: A100 40GB VRAM (REQUIRED — no CPU offload)
- **Resolution**: 768x1024 (higher quality on A100)
- **Steps**: 30 inference steps, guidance_scale=30
- **Expected Speed**: ~30-60s on A100 (vs ~324s on L4 with CPU offload)
- **Colab Notebook**: `colabs/CatVTON_FLUX_Server.ipynb`
- **Secret**: `CATVTON_COLAB_URL` (Gradio share URL, expires 72h)
- **HF Model**: `black-forest-labs/FLUX.1-Fill-dev` (gated, needs HF_TOKEN)
- **LoRA**: `xiaozaa/catvton-flux-lora-alpha`

### 2. IDM-VTON (Open Source)
- **Model**: Dual-UNet architecture via HuggingFace Spaces proxy
- **GPU**: T4 (no local GPU needed — proxies to HF Space `yisol/IDM-VTON`)
- **Resolution**: 768x1024
- **Expected Speed**: ~29s
- **Colab Notebook**: `colabs/IDM_VTON_Server.ipynb`
- **Secret**: `IDM_VTON_COLAB_URL` (Gradio share URL, expires 72h)
- **Pinned gradio**: `>=5.10.0,<5.22.0` and `gradio_client>=1.5.0,<1.7.0`

### 3. Vertex AI (Google Cloud)
- **Model**: `virtual-try-on-001`
- **Infrastructure**: Google Cloud, no GPU management needed
- **Resolution**: 768x1024
- **Expected Speed**: ~10s (fastest)
- **Secret**: `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON`
- **GCP Project**: `fynd-jio-impetus-non-prod`
- **GCP Location**: `us-central1`

## Critical Production Learnings

### GPU Selection
- **NEVER use L4 for CatVTON-FLUX** — CPU offloading makes it 324s (5+ min)
- **A100 40GB minimum** — entire FLUX model fits in VRAM, ~30-60s inference
- **Remove `enable_sequential_cpu_offload()`** when using A100
- **Use `.to(device)` + `enable_attention_slicing()`** for A100
- **Always wrap inference in `torch.inference_mode()`** for speed

### Image Requirements
- **Full-body photos ONLY** — selfies/close-ups don't work for VTO
- **Resize to 768x1024** before sending to any model
- **Max file size**: ~200KB JPEG after resize (prevents edge function memory issues)
- **Original 4928x6560 images cause Worker Limit (546) errors** — always resize first
- **Format**: JPEG quality 85-90 is optimal balance

### Edge Function Constraints
- **Supabase timeout**: ~150s hard limit on edge functions
- **CatVTON-FLUX exceeds this** even on A100 (~30-60s) — OK for 2-model runs
- **3-model parallel runs may timeout** if CatVTON is slow
- **Solution**: Run models selectively via `models` param, or use async/webhook pattern
- **Worker Limit (546)**: Large base64 payloads can exhaust compute — resize images first
- **504 Gateway Timeout**: Reduce model count or use faster models only

### Colab Runtime Management
- **Runtimes disconnect after ~1hr idle** — need keep-alive pings for production
- **Gradio share URLs expire in 72 hours** — must update Supabase secrets on restart
- **Monaco editor in Colab can create DUPLICATE cells** — be careful with programmatic editing
- **Colab caches notebooks** — navigating to GitHub URL may show stale version
- **Always verify cell content** before running after programmatic edits

### Supabase Configuration
- **Project ID**: `qfumhgipfhzubmorymbd`
- **Edge Function**: `generate-virtual-tryon`
- **Storage Bucket**: `vto-images`
- **Session Table**: `vto_sessions`
- **RLS enabled** — can't insert directly, use `create-session` edge function
- **Secrets API**: POST to `https://api.supabase.com/v1/projects/{id}/secrets`

### Image Preprocessing (TODO for production)
- Auto-detect selfie vs full-body (reject selfies)
- Background removal/cleanup
- Pose normalization
- Brightness/contrast correction
- Resolution upscaling for low-quality inputs
- Auto-crop and alignment
- Bad angle detection and correction

## API Flow

```
1. POST /functions/v1/create-session -> { sessionToken }
2. POST /functions/v1/generate-virtual-tryon
   Headers: { x-session-token, Authorization }
   Body: { fullBodyImage, selfieImage, outfitImageUrls[], category, garmentDescription, models[] }
   Response: { success, imageUrl, winner, scores, modelResults[], generationsRemaining }
3. GET /compare -> Polls vto_sessions for model_comparison_data
```

## Credentials Reference
- **HF Token**: Stored as Colab secret `HF_TOKEN`
- **Supabase Anon Key**: In `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`
- **GCP Service Account**: Stored as Supabase secret `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON`
- **GitHub PAT**: For pushing notebook changes

## File Structure
```
colabs/
  CatVTON_FLUX_Server.ipynb   # A100-optimized FLUX + LoRA
  IDM_VTON_Server.ipynb       # T4 HF Spaces proxy
supabase/functions/
  create-session/              # Session management
  generate-virtual-tryon/      # Multi-model orchestrator
  update-session/              # Session updates
src/pages/
  Index.tsx                    # Kiosk page (/)
  OutputDisplay.tsx            # Big screen (/display)
  ModelComparison.tsx          # Compare page (/compare)
```
