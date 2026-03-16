from __future__ import annotations

import json
import subprocess
from fractions import Fraction
from pathlib import Path
from typing import Any

from scenedetect import SceneManager, open_video
from scenedetect.detectors import AdaptiveDetector

try:
    from .config import REVIEW_OUTPUT_DIR
except ImportError:
    from config import REVIEW_OUTPUT_DIR


def _run_ffmpeg(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def _probe_video(video_path: str) -> tuple[float, float]:
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate:format=duration",
            "-of",
            "json",
            video_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(probe.stdout)
    stream = payload["streams"][0]
    duration = float(payload["format"]["duration"])
    fps = float(Fraction(stream["r_frame_rate"]))
    return duration, fps


def _round_timestamp(value: float) -> float:
    return round(max(0.0, value), 3)


def _export_review_thumbnail(video_path: str, output_path: Path, timestamp: float) -> None:
    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            video_path,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(output_path),
        ]
    )


def detect_shots(video_path: str) -> list[dict[str, Any]]:
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(AdaptiveDetector())
    scene_manager.detect_scenes(video=video)

    shots: list[dict[str, Any]] = []
    for index, (start_time, end_time) in enumerate(
        scene_manager.get_scene_list(start_in_scene=True),
        start=1,
    ):
        start_seconds = start_time.get_seconds()
        end_seconds = end_time.get_seconds()
        shots.append(
            {
                "index": index,
                "start_time": start_seconds,
                "end_time": end_seconds,
                "duration": max(0.0, end_seconds - start_seconds),
            }
        )

    print(f"Detected {len(shots)} shots in {video_path}")
    return shots


def detect_and_export(video_path: str, output_path: str) -> list[dict[str, Any]]:
    """Detect shots and export results as JSON for review."""
    source_path = Path(video_path).resolve()
    export_path = Path(output_path).resolve()
    export_path.parent.mkdir(parents=True, exist_ok=True)

    total_duration, fps = _probe_video(str(source_path))
    shots = detect_shots(str(source_path))

    thumbnail_dir = REVIEW_OUTPUT_DIR / source_path.stem
    thumbnail_dir.mkdir(parents=True, exist_ok=True)

    splits: list[dict[str, Any]] = []
    for index, shot in enumerate(shots, start=1):
        start_time = _round_timestamp(float(shot["start_time"]))
        end_time = _round_timestamp(min(float(shot["end_time"]), total_duration))
        thumbnail_time = _round_timestamp(start_time + max(end_time - start_time, 0.0) / 2)

        splits.append(
            {
                "start": start_time,
                "end": end_time,
                "thumbnail_time": thumbnail_time,
            }
        )

        _export_review_thumbnail(
            str(source_path),
            thumbnail_dir / f"{source_path.stem}_shot_{index:04d}.jpg",
            thumbnail_time,
        )

    payload = {
        "source_video": str(source_path),
        "filename": source_path.name,
        "total_duration": _round_timestamp(total_duration),
        "fps": round(fps, 3),
        "splits": splits,
    }

    export_path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    print(f"Exported review JSON to {export_path}")
    print(f"Generated {len(splits)} review thumbnails in {thumbnail_dir}")
    return splits
