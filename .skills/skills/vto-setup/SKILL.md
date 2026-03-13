---
name: vto-setup
description: "Virtual Try-On (VTO) system setup, testing, and troubleshooting for the Fashion Lens kiosk app. Use this skill whenever working with VTO models (CatVTON-FLUX, IDM-VTON, Vertex AI), Colab runtimes, Supabase edge functions, image preprocessing, or the kiosk compare page. Also trigger when the user mentions virtual try-on, garment overlay, fashion AI, model comparison, Gradio URLs, or any GPU/inference optimization for this project."
---

# VTO System Setup & Operations Skill

This skill captures all production learnings for the Fashion Lens Virtual Try-On system so you never repeat past mistakes. Read `references/specs.md` for the full technical reference. The sections below cover the most critical operational patterns.

## Architecture Quick Reference

```
[Kiosk Tablet /] → [Supabase Edge Function] → [3 Models in Parallel] → [Compare Page /compare]
                         ↓                          ↓
                  [Supabase Storage]         [AI Judge (Claude)]
                  [vto_sessions DB]          [Winner Selection]
```

**Supabase Project**: `qfumhgipfhzubmorymbd`
**Edge Functions**: `create-session`, `generate-virtual-tryon`, `update-session`
**Storage Bucket**: `vto-images`
**GitHub Repo**: `salmansaudagar-ai/fashion-lens-now`

## Critical Rules (learned the hard way)

### 1. Image Preprocessing — ALWAYS Resize First
Original camera images (4928x6560, ~3.7MB) will crash the edge function with a **Worker Limit (546)** error. Every image must be resized to **768x1024** (JPEG quality 85-90, target ~200KB) before sending to any model. This applies to both person and garment images.

Full-body photos only — selfies and close-ups produce garbage results because the VTO models need to see the full torso to map garments correctly.

### 2. GPU Selection for CatVTON-FLUX
CatVTON-FLUX uses FLUX.1-Fill-dev (12B params). On an L4 GPU, it requires CPU offloading which takes **324 seconds** per inference — completely unusable. On an **A100 40GB**, the entire model fits in VRAM and inference takes **30-60 seconds**.

When setting up the CatVTON-FLUX Colab:
- Select **A100 GPU** runtime (not L4, not T4)
- **Remove** `enable_sequential_cpu_offload()` — this is the L4 workaround that destroys performance
- Use `.to(device)` to load the model directly to GPU
- Enable `pipe.enable_attention_slicing()` for memory efficiency
- Wrap inference in `torch.inference_mode()` for speed
- Use resolution **768x1024** (A100 can handle it; L4 needed 512x768)

### 3. Edge Function Timeout (150s Hard Limit)
Supabase edge functions have a ~150 second timeout. Running all 3 models in parallel can exceed this if CatVTON-FLUX is slow. Solutions:
- Use the `models` parameter to select specific models: `["idm-vton", "vertex-ai"]` completes in ~35s
- With CatVTON-FLUX on A100 (~30-60s), all 3 should fit within the timeout
- If you see **504 Gateway Timeout**, reduce the number of models

### 4. Colab Runtime Management
- Runtimes disconnect after ~1hr idle — need keep-alive for production
- **Gradio share URLs expire in 72 hours** — after restarting a Colab, you must update the corresponding Supabase secret (`CATVTON_COLAB_URL` or `IDM_VTON_COLAB_URL`)
- Colab caches notebooks from GitHub — if you push code changes, the Colab may show stale code. Update cells via Monaco editor: `window.monaco.editor.getEditors()[index].getModel().setValue(newCode)`
- Monaco editor can create **duplicate cells** — verify cell content before running

### 5. Session Management (RLS)
Row-Level Security blocks direct DB inserts to `vto_sessions`. Always use the `create-session` edge function first to get a `sessionToken`, then pass it via the `x-session-token` header to `generate-virtual-tryon`.

## Setup Checklist

When setting up or recovering the VTO system, follow this order:

1. **Start Colabs**
   - CatVTON-FLUX: A100 GPU → Run all cells → Copy Gradio URL
   - IDM-VTON: T4 GPU → Run all cells → Copy Gradio URL

2. **Update Supabase Secrets**
   ```bash
   curl -s -X POST \
     "https://api.supabase.com/v1/projects/qfumhgipfhzubmorymbd/secrets" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '[{"name": "CATVTON_COLAB_URL", "value": "YOUR_GRADIO_URL"}]'
   ```
   Do the same for `IDM_VTON_COLAB_URL`.

3. **Test with Edge Function**
   - Create a session first via `create-session`
   - Send resized (768x1024) images to `generate-virtual-tryon`
   - Start with `["idm-vton", "vertex-ai"]` to verify quickly (~35s)
   - Then add `"catvton-flux"` once confirmed working

4. **Verify Compare Page**
   - The compare page at `/compare` polls `vto_sessions` for `model_comparison_data`
   - Needs the dev server running (`npm run dev`) or a deployed version

### 6. IDM-VTON ZeroGPU Quota
IDM-VTON proxies to the HuggingFace Space `yisol/IDM-VTON` which uses ZeroGPU. Unlogged/free users hit daily quota limits. When this happens you'll see an error about "daily ZeroGPU quotas". Solutions:
- Login to HuggingFace in the Colab to get more quota
- Or rely on CatVTON-FLUX + Vertex AI (both are self-hosted/cloud and don't have quota issues)

## Testing Script

Use `scripts/test_vto.sh` to quickly test the edge function. Read the script for usage — it handles session creation, image resizing, and model selection.

## Benchmark Results (March 2026)

All 3 models on A100 + T4 + Cloud:
- **CatVTON-FLUX (A100)**: 28.3s — **11.5x faster** than L4 (324s)
- **IDM-VTON (HF Space)**: ~29s when quota available
- **Vertex AI (Cloud)**: 10.2s — consistently fastest
- **Total edge function time**: ~34s (parallel execution)

## Model Details

| Model | GPU | Speed | Resolution | Secret Key |
|-------|-----|-------|------------|------------|
| CatVTON-FLUX | A100 40GB | ~30-60s | 768x1024 | `CATVTON_COLAB_URL` |
| IDM-VTON | T4 (HF proxy) | ~29s | 768x1024 | `IDM_VTON_COLAB_URL` |
| Vertex AI | Cloud (no GPU) | ~10s | 768x1024 | `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON` |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Worker Limit (546) | Images too large | Resize to 768x1024 before sending |
| 504 Gateway Timeout | Models too slow | Use fewer models or check GPU type |
| RLS policy violation | Direct DB insert | Use `create-session` edge function |
| Gradio URL not found | Colab disconnected | Restart Colab, get new URL, update secret |
| Poor VTO results | Selfie/close-up input | Use full-body photos only |
| CatVTON 324s inference | Wrong GPU (L4) | Switch to A100, remove CPU offload |
