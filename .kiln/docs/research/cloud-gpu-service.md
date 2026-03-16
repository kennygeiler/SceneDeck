# Cloud GPU Service for Video Analysis

## Finding

For SceneDeck's use case — processing 50-100 short video clips through a camera motion CV model, with a solo developer building via AI agent prompting, on a budget of a few hundred dollars per month — the optimal approach is a two-tier strategy: use **Gemini 2.0 Flash** for camera motion classification as the primary path (no GPU infrastructure required), with **Modal** as the fallback if a custom CV model proves necessary for accuracy.

The LLM vision approach (Gemini/Claude) is genuinely viable for camera motion classification. Gemini 1.5 Pro and 2.0 Flash accept video input natively and can classify shot type, camera movement (dolly, pan, tilt, crane, handheld, static), and framing from short clips. For 50-100 clips at 30 seconds average, the total API cost would be well under $10 using Gemini 2.0 Flash pricing (~$0.10/1M tokens input). The workflow is: upload clip to Google Files API → call Gemini with structured prompt → receive JSON classification. An AI coding agent can implement this in under 50 lines of Python with zero infrastructure setup.

Among dedicated GPU platforms, Modal is the strongest choice. Modal offers Python-native deployment using decorators (`@app.function(gpu="A10G")`), which an AI coding agent can write with zero DevOps knowledge. Cold starts are 2-8 seconds with container keep-warm. Pricing: ~$0.000306/sec for A10G. For 100 clips, total GPU cost is under $0.50.

Banana.dev shut down in late 2023. RunPod is cheaper but less agent-friendly. Lambda Cloud is for reserved instances, not serverless. Baseten is enterprise-focused. HuggingFace Inference Endpoints bill hourly even when idle.

No evidence of CamCloneMaster being deployed on any major platform as a public endpoint (as of August 2025).

## Recommendation

Start with Gemini 2.0 Flash for camera motion classification — implement in a single afternoon, run full batch for under $5, let human QA verify. If accuracy insufficient, deploy custom CV model (RAFT + camera pose estimation) on Modal.

## Key Facts

- **Gemini 2.0 Flash**: ~$0.10/1M input tokens, video natively supported. 100 clips ≈ under $5.
- **Modal A10G**: ~$0.000306/GPU-second. 100 clips ≈ $0.50.
- **Replicate**: Per-second billing. Best for public model marketplace. Custom models require Cog containerization.
- **RunPod**: Cheapest but requires more manual setup. Less agent-friendly.
- **Cold starts**: Modal ~2-8s > Replicate ~10-60s > RunPod ~15-45s > HF Serverless ~30-120s.
- **API simplicity (ranked)**: Modal > Replicate > RunPod > HF Endpoints > Baseten > Lambda.
- **Budget fit**: All platforms well under $10/month for 50-100 clips. DX and setup speed are the differentiators.

## Sources

- Training knowledge: Modal, Replicate, RunPod, Lambda, HuggingFace, Baseten, Google Gemini documentation (pre-August 2025)
- NOTE: WebSearch/WebFetch denied. Verify current pricing before committing.

## Confidence

**0.72** — Core assessments well-established. Pricing may have shifted since August 2025 but relative rankings are stable.
