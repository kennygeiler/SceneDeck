from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

try:
    from .classify import classify_shot
    from .config import CLIPS_OUTPUT_DIR
    from .shot_detect import detect_shots
except ImportError:
    from classify import classify_shot
    from config import CLIPS_OUTPUT_DIR
    from shot_detect import detect_shots

try:
    from .extract_clips import extract_clips
    from .upload_blob import upload_to_blob
    from .write_db import write_to_db
except ImportError:
    from extract_clips import extract_clips
    from upload_blob import upload_to_blob
    from write_db import write_to_db


def _slug_part(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower().strip())
    return slug.strip("-") or "untitled"


def _build_blob_filename(
    film_title: str, video_stem: str, shot_index: int, extension: str
) -> str:
    safe_title = _slug_part(film_title)
    safe_stem = _slug_part(video_stem)
    return f"films/{safe_title}/{safe_stem}/shot-{shot_index:04d}.{extension}"


def run_pipeline(video_path: str, film_title: str, director: str, year: int | None) -> None:
    source_path = Path(video_path).resolve()
    output_dir = CLIPS_OUTPUT_DIR / source_path.stem

    print("Step 1/5: Detecting shots")
    shots = detect_shots(str(source_path))
    if not shots:
        print("No shots detected; nothing to process.")
        return

    print("Step 2/5: Extracting clips and thumbnails")
    extract_clips(str(source_path), shots, str(output_dir))

    print("Step 3/5: Classifying clips with Gemini")
    enriched_shots: list[dict[str, Any]] = []
    for shot in shots:
        clip_path = shot["clip_path"]
        thumbnail_path = shot["thumbnail_path"]
        shot_index = int(shot["index"])

        classification = classify_shot(clip_path)
        classification["classification_source"] = "gemini"

        print(f"Step 4/5: Uploading assets for shot {shot_index}/{len(shots)}")
        clip_url = upload_to_blob(
            clip_path,
            _build_blob_filename(film_title, source_path.stem, shot_index, "mp4"),
        )
        thumbnail_url = upload_to_blob(
            thumbnail_path,
            _build_blob_filename(film_title, source_path.stem, shot_index, "jpg"),
        )

        enriched_shots.append(
            {
                **shot,
                **classification,
                "source_file": str(source_path),
                "video_url": clip_url,
                "thumbnail_url": thumbnail_url,
                "subjects": [],
                "technique_notes": None,
            }
        )

    print("Step 5/5: Writing records to Neon")
    write_to_db(
        {
            "title": film_title,
            "director": director,
            "year": year,
        },
        enriched_shots,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SceneDeck video ingestion pipeline")
    parser.add_argument("--video", required=True, help="Path to the source video file")
    parser.add_argument("--film-title", required=True, help="Film title")
    parser.add_argument("--director", required=True, help="Film director")
    parser.add_argument("--year", type=int, help="Film release year")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_pipeline(args.video, args.film_title, args.director, args.year)
