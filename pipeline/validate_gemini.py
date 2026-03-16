from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from .classify import classify_shot
except ImportError:
    from classify import classify_shot


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Gemini validation on a small set of clips"
    )
    parser.add_argument("clips", nargs="+", help="Clip files to classify")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    for clip in args.clips:
        clip_path = Path(clip).resolve()
        print(f"\n=== {clip_path.name} ===")
        result = classify_shot(str(clip_path))
        print(json.dumps(result, indent=2))
