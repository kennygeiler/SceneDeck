from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

try:
    from .config import THUMBNAILS_OUTPUT_DIR
except ImportError:
    from config import THUMBNAILS_OUTPUT_DIR


def _run_ffmpeg(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def extract_clips(
    video_path: str, shots: list[dict[str, Any]], output_dir: str
) -> list[str]:
    clip_dir = Path(output_dir)
    thumb_dir = THUMBNAILS_OUTPUT_DIR / clip_dir.name
    clip_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    video_name = Path(video_path).stem
    clip_paths: list[str] = []

    for shot in shots:
        index = int(shot["index"])
        start_time = float(shot["start_time"])
        duration = float(shot["duration"])
        midpoint = start_time + (duration / 2 if duration > 0 else 0)

        clip_filename = f"{video_name}_shot_{index:04d}.mp4"
        clip_path = clip_dir / clip_filename
        thumbnail_path = thumb_dir / f"{video_name}_shot_{index:04d}.jpg"

        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{start_time:.3f}",
                "-i",
                video_path,
                "-t",
                f"{max(duration, 0.05):.3f}",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "18",
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(clip_path),
            ]
        )

        _run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{midpoint:.3f}",
                "-i",
                video_path,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(thumbnail_path),
            ]
        )

        shot["clip_path"] = str(clip_path)
        shot["thumbnail_path"] = str(thumbnail_path)
        clip_paths.append(str(clip_path))

    print(f"Extracted {len(clip_paths)} clips to {clip_dir}")
    return clip_paths
