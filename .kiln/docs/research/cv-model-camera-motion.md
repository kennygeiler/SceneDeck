# cv-model-camera-motion: Camera Motion Extraction and Classification for Video

## Finding

**The most practical production-ready approach for extracting and classifying camera motion into a fixed taxonomy is a pipeline built on RAFT optical flow estimation combined with a geometric decomposition classifier**, not any single end-to-end "camera motion extraction" model. Models marketed for "camera motion" — including CamCloneMaster/CameraCtrl (KwaiVGI) — are primarily designed for camera-controlled video *generation*, not for *extracting and labeling* motion from arbitrary input clips.

**CameraCtrl / CamCloneMaster (KwaiVGI, April 2024):** Published as arxiv:2404.02101, CameraCtrl adds camera pose conditioning to AnimateDiff/video diffusion models by encoding camera trajectories as Plücker coordinate sequences. The extraction component outputs raw 6-DoF pose sequences (rotation matrices + translation vectors), not human-readable taxonomy labels. Converting these to labels requires an additional classification layer not provided out of the box. The full pipeline requires large diffusion model infrastructure, making it heavyweight and expensive for metadata extraction.

**The recommended approach — RAFT + Geometric Decomposition + Lightweight Classifier:** RAFT (Recurrent All-Pairs Field Transforms, Teed & Deng, ECCV 2020) is the most accurate dense optical flow model available. The pipeline:
1. Extract dense optical flow between sampled frame pairs using RAFT
2. Estimate a global homography or fundamental matrix from the flow field
3. Decompose the homography into rotation (pan/tilt), scale (zoom), and translation (dolly/truck/crane) components
4. Classify residual flow patterns as handheld shake
5. Apply threshold rules or a trained lightweight classifier (SVM or small MLP) to assign the taxonomy label

This pipeline is modular, interpretable, deployable on Replicate/Modal/RunPod without large model weights, and produces deterministic outputs suitable for a fixed taxonomy.

**Alternative end-to-end approaches:** VideoMAE and similar video transformer models can be fine-tuned but require labeled training data and do not decompose motion into interpretable components. No purpose-built "camera motion classifier into taxonomy" model exists on Replicate or HuggingFace as of August 2025.

**Drift on longer shots:** Mitigated by sampling at fixed intervals (every 5-10 frames) and aggregating via majority vote or temporal smoothing. For shot-level classification, most cinema shots are under 30 seconds and dominant motion type is consistent within a shot.

## Recommendation

Build a custom pipeline: RAFT optical flow on Replicate/Modal for flow estimation, followed by geometric decomposition + rule-based classifier (Python, no GPU needed) that outputs fixed taxonomy labels. Do not use CameraCtrl/CamCloneMaster as a classification API — it adds integration complexity for no accuracy benefit over RAFT.

## Key Facts

- **CameraCtrl (KwaiVGI):** arxiv:2404.02101. Outputs 6-DoF pose sequences, not taxonomy labels. Requires AnimateDiff infrastructure.
- **RAFT (Teed & Deng):** ECCV 2020. State-of-the-art dense optical flow. Sintel EPE ~1.43. Available on Replicate. RAFT-Small trades ~15% accuracy for ~3x speed.
- **Homography decomposition:** Standard OpenCV operation (`cv2.decomposeHomographyMat`). Deterministic, no training data required.
- **Handheld detection:** High-frequency residual flow after homography removal. Detected by variance threshold.
- **Taxonomy feasibility:** Pan, tilt, dolly, zoom, crane, static, handheld, and compound moves all detectable via this pipeline.
- **Processing speed:** RAFT on T4 GPU: ~10-30 fps for 480p. 10-second shot with sparse sampling: under 5 seconds.
- **No existing Replicate classifier:** Must be assembled from components.

## Sources

- arxiv:2404.02101 — CameraCtrl (He et al., KwaiVGI, 2024) — *training knowledge*
- Teed & Deng, "RAFT: Recurrent All-Pairs Field Transforms for Optical Flow," ECCV 2020 — *training knowledge*
- OpenCV documentation: `cv2.decomposeHomographyMat` — *training knowledge*
- MotionCTRL (Wang et al., CUHK, 2023) — *training knowledge*

## Confidence

**0.65** — Core technical findings well-established. Capped due to lack of live web verification of current Replicate model catalog and post-August 2025 developments.
