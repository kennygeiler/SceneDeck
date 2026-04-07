"""
Export hard-cut timestamps (seconds) for MetroVision ingest merge.

  pip install -r requirements-transnet.txt   # in pipeline/.venv
  python -m pipeline.transnet_cuts /path/to/film.mp4 -o cuts.json

Then either:
  - Set METROVISION_EXTRA_BOUNDARY_CUTS_JSON to cuts.json (global for one worker run), or
  - Pass extraBoundaryCuts in the ingest JSON body (worker / Next), or
  - Use pyscenedetect_ensemble_pyscene so PyScene merges with TransNet cuts.

cuts.json format: [12.4, 48.02, ...]  (interior transition times; 0 and duration optional)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _scenes_to_interior_cuts(scenes: list[dict[str, Any]]) -> list[float]:
    """Use start_time of every shot after the first as a hard-cut instant."""
    if not scenes:
        return []
    cuts: list[float] = []
    for i in range(1, len(scenes)):
        st = scenes[i].get("start_time")
        if st is not None:
            cuts.append(round(float(st), 3))
    return sorted(set(cuts))


def _run_transnet(video: str, threshold: float, device: str) -> list[float]:
    try:
        import torch
        from transnetv2_pytorch import TransNetV2  # type: ignore[import-untyped]
    except ImportError as e:
        raise SystemExit(
            "transnetv2_pytorch is not installed. In pipeline/: "
            "pip install -r requirements-transnet.txt\n"
            f"Original error: {e}",
        ) from e

    model = TransNetV2(device=device)
    model.eval()
    with torch.inference_mode():
        scenes = model.detect_scenes(video, threshold=threshold)
    if not isinstance(scenes, list):
        raise SystemExit(f"Unexpected detect_scenes return type: {type(scenes)}")
    return _scenes_to_interior_cuts(scenes)


def main() -> None:
    p = argparse.ArgumentParser(description="TransNet V2 → JSON cut times for MetroVision.")
    p.add_argument("video", help="Path to video file")
    p.add_argument("-o", "--output", required=True, help="Output .json path (array of seconds)")
    p.add_argument("--threshold", type=float, default=0.5, help="Detection threshold (model default ~0.5)")
    p.add_argument(
        "--device",
        default="auto",
        help="auto | cpu | cuda | mps (see transnetv2-pytorch docs; cpu is most reproducible)",
    )
    args = p.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        raise SystemExit(f"Video not found: {video_path}")

    cuts = _run_transnet(str(video_path), args.threshold, args.device)
    out_path = Path(args.output).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(cuts, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(cuts)} interior cuts to {out_path}")


if __name__ == "__main__":
    main()
