# Shot Boundary Detection

## Finding

**PySceneDetect** is the most mature Python-native library for shot boundary detection. Version 0.6.x ships three detectors: `ContentDetector` (HSV color histogram delta, default threshold 27.0), `ThresholdDetector` (luminance for fades), and `AdaptiveDetector` (rolling-window mean delta — best for high-motion content). Runs on CPU, no GPU dependency. Python API: `detect()`, `split_video_ffmpeg()`, `save_images()`. Output: list of `(start_timecode, end_timecode)` tuples, exportable to CSV/SRT. Install: `pip install scenedetect[opencv]`.

**TransNetV2** is a deep-learning shot transition detector with higher accuracy (F1 ~0.93 on RAI dataset vs PySceneDetect ~0.75-0.80). Uses dilated CNN on 48-frame windows. Classifies "abrupt" vs "gradual" transitions. Model is ~15 MB; CPU inference viable but slow. Requires TensorFlow 2.x and manual repo clone — no pip package. High integration friction for AI coding agents.

**FFmpeg scene detection** uses `select` filter with scene expression. Computes per-frame histogram difference (0.0-1.0). No Python objects — only log lines. No dissolve/fade modeling. Insufficient for structured pipelines.

**Scene-level detection** (grouping shots into scenes) is harder with no dominant tool:
1. **Visual similarity clustering** — CLIP/ResNet embeddings + agglomerative clustering. Works for location-based scenes; fails on shot-reverse-shot.
2. **Audio analysis** — pyannote.audio speaker diarization; silence/music cues signal boundaries.
3. **LLM-based grouping** — Send keyframes to Gemini/Claude vision for scene grouping. Highest accuracy for narrative cinema. Feasible for 50-100 shot seed dataset.

## Recommendation

**PySceneDetect with AdaptiveDetector** as primary shot boundary detector — CPU-only, pip-installable, clean Python API, directly writable by AI coding agents. For scene-level grouping: **Gemini/Claude vision on keyframes** given the small seed dataset and existing LLM infrastructure.

## Key Facts

- PySceneDetect: `pip install scenedetect[opencv]`, CPU-only, three detector modes
- TransNetV2: F1 ~0.93 vs PySceneDetect ~0.75-0.80, but requires TF2 manual setup
- FFmpeg: outputs to stderr only, no Python API, no dissolve modeling
- Wipes not natively handled by any tool; require custom optical flow
- CLIP ViT-B/32 or L/14 standard for shot embedding/clustering
- Gemini 1.5 Pro: up to 1M token context, can reason across entire scene's keyframes
- For 50-100 shot seed: LLM-based scene grouping cost is negligible

## Sources

- PySceneDetect docs: scenedetect.com/docs/ (training knowledge, v0.6.x)
- TransNetV2: arXiv:2008.04838 (Souček & Lokoč, 2020)
- FFmpeg filters documentation
- CLIP: Radford et al., OpenAI, 2021
- pyannote.audio GitHub
- Gemini 1.5 Pro technical report, Google DeepMind, 2024

## Confidence

**0.75** — Training-knowledge-based. Core facts well-established. Capped below 0.8 due to no live verification and possible PySceneDetect API changes post-cutoff.
