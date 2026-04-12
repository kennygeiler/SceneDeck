from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    from .classify import classify_shot
    from .config import CLIPS_OUTPUT_DIR, REVIEW_OUTPUT_DIR
    from .shot_detect import detect_and_export, detect_shots
except ImportError:
    from classify import classify_shot
    from config import CLIPS_OUTPUT_DIR, REVIEW_OUTPUT_DIR
    from shot_detect import detect_and_export, detect_shots

try:
    from .extract_clips import extract_clips
    from .write_db import write_to_db
except ImportError:
    from extract_clips import extract_clips
    from write_db import write_to_db


def _slug_part(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower().strip())
    return slug.strip("-") or "untitled"


def _load_reviewed_shots(
    splits_path: str, source_path: Path
) -> list[dict[str, float | int]]:
    payload = json.loads(Path(splits_path).read_text(encoding="utf-8"))
    splits = payload.get("splits", [])
    if not isinstance(splits, list):
        raise ValueError("Reviewed splits JSON must contain a 'splits' array.")

    declared_source = payload.get("source_video")
    if declared_source and Path(str(declared_source)).resolve() != source_path.resolve():
        print(
            "Warning: splits JSON source video does not match the provided --video path."
        )

    shots: list[dict[str, float | int]] = []
    for index, split in enumerate(splits, start=1):
        start_time = float(split["start"])
        end_time = float(split["end"])
        shots.append(
            {
                "index": index,
                "start_time": start_time,
                "end_time": end_time,
                "duration": max(0.0, end_time - start_time),
            }
        )

    return shots


def run_review_export(video_path: str) -> None:
    source_path = Path(video_path).resolve()
    export_path = REVIEW_OUTPUT_DIR / f"{source_path.stem}-splits.json"

    print("Step 1/1: Detecting shots and exporting review package")
    detect_and_export(str(source_path), str(export_path))
    print(f"Tune boundaries in /tuning (or ingest), then continue with --splits {export_path}")


def run_pipeline(
    video_path: str,
    film_title: str,
    director: str,
    year: int | None,
    splits_path: str | None = None,
) -> None:
    source_path = Path(video_path).resolve()
    output_dir = CLIPS_OUTPUT_DIR / source_path.stem

    if splits_path:
        print("Step 1/4: Loading reviewed splits")
        shots = _load_reviewed_shots(splits_path, source_path)
    else:
        print("Step 1/4: Detecting shots")
        shots = detect_shots(str(source_path))

    if not shots:
        print("No shots detected; nothing to process.")
        return

    print("Step 2/4: Extracting clips and thumbnails")
    extract_clips(str(source_path), shots, str(output_dir))

    print("Step 3/4: Classifying clips with Gemini")
    enriched_shots: list[dict[str, Any]] = []
    for shot in shots:
        clip_path = shot["clip_path"]
        thumbnail_path = shot["thumbnail_path"]
        shot_index = int(shot["index"])

        classification = classify_shot(clip_path)
        classification["classification_source"] = "gemini"

        enriched_shots.append(
            {
                **shot,
                **classification,
                "source_file": str(source_path),
                "video_url": clip_path,
                "thumbnail_url": thumbnail_path,
                "subjects": [],
                "technique_notes": None,
            }
        )

    print("Step 4/4: Writing records to Neon")
    write_to_db(
        {
            "title": film_title,
            "director": director,
            "year": year,
        },
        enriched_shots,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MetroVision video ingestion pipeline")
    parser.add_argument("--video", required=True, help="Path to the source video file")
    parser.add_argument("--film-title", help="Film title")
    parser.add_argument("--director", help="Film director")
    parser.add_argument("--year", type=int, help="Film release year")
    parser.add_argument(
        "--review",
        action="store_true",
        help="Detect shots, export review JSON, and stop before extraction/classification",
    )
    parser.add_argument(
        "--splits",
        help="Path to reviewed splits JSON exported from the review tool",
    )
    args = parser.parse_args()

    if args.review and args.splits:
        parser.error("--review and --splits cannot be used together.")

    if not args.review and not args.film_title:
        parser.error("--film-title is required unless --review is used.")

    if not args.review and not args.director:
        parser.error("--director is required unless --review is used.")

    return args


if __name__ == "__main__":
    args = parse_args()
    if args.review:
        run_review_export(args.video)
    else:
        run_pipeline(args.video, args.film_title, args.director, args.year, args.splits)
