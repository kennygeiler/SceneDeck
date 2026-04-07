from __future__ import annotations

import json
import math
import os
import subprocess
from fractions import Fraction
from pathlib import Path
from typing import Any

from scenedetect import SceneManager, open_video
from scenedetect.detectors import AdaptiveDetector, ContentDetector

try:
    from .config import REVIEW_OUTPUT_DIR
except ImportError:
    from config import REVIEW_OUTPUT_DIR

# Match TS ingest (`src/lib/ingest-pipeline.ts`):
# - content: detect-content -t 27 -d 4
# - adaptive: detect-adaptive -t 3 (no fixed downscale; SceneManager auto_downscale default)
_DEFAULT_DETECTOR = "adaptive"


def _effective_detector() -> str:
    raw = os.environ.get("METROVISION_SHOT_DETECTOR", _DEFAULT_DETECTOR).strip().lower()
    if raw in ("content", "adaptive"):
        return raw
    return _DEFAULT_DETECTOR


def _boundary_ensemble_enabled() -> bool:
    raw = os.environ.get("METROVISION_BOUNDARY_DETECTOR", "").strip().lower()
    return raw in ("pyscenedetect_ensemble", "pyscenedetect_ensemble_pyscene")


def _merge_eps() -> float:
    raw = os.environ.get("METROVISION_BOUNDARY_MERGE_GAP_SEC", "").strip()
    if not raw:
        return 0.35
    try:
        v = float(raw)
        return v if v > 0 else 0.35
    except ValueError:
        return 0.35


def _load_extra_boundary_cuts() -> list[float]:
    p = os.environ.get("METROVISION_EXTRA_BOUNDARY_CUTS_JSON", "").strip()
    if not p:
        return []
    try:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return []
        out: list[float] = []
        for x in data:
            try:
                v = float(x)
            except (TypeError, ValueError):
                continue
            if v >= 0 and math.isfinite(v):
                out.append(round(v, 3))
        return out
    except (OSError, json.JSONDecodeError):
        return []


def _cluster_cut_times(times: list[float], eps: float) -> list[float]:
    uniq = sorted({round(max(0.0, t), 3) for t in times})
    if not uniq:
        return []
    merged: list[float] = []
    start = uniq[0]
    ssum = uniq[0]
    count = 1
    for t in uniq[1:]:
        if t - start <= eps:
            ssum += t
            count += 1
        else:
            merged.append(round(ssum / count, 3))
            start = t
            ssum = t
            count = 1
    merged.append(round(ssum / count, 3))
    return merged


def _detect_once(video_path: str, detector: str) -> list[dict[str, Any]]:
    video = open_video(video_path)
    scene_manager = SceneManager()
    if detector == "content":
        scene_manager.auto_downscale = False
        scene_manager.downscale = 4
        scene_manager.add_detector(ContentDetector(threshold=27.0))
    else:
        scene_manager.add_detector(AdaptiveDetector(adaptive_threshold=3.0))
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
    if not shots:
        duration, _fps = _probe_video(video_path)
        return [
            {
                "index": 1,
                "start_time": 0.0,
                "end_time": duration,
                "duration": duration,
            }
        ]
    return shots


def _endpoints_from_shots(shots: list[dict[str, Any]]) -> list[float]:
    out: set[float] = set()
    for s in shots:
        out.add(round(float(s["start_time"]), 3))
        out.add(round(float(s["end_time"]), 3))
    return list(out)


def _shots_from_boundaries(boundaries: list[float]) -> list[dict[str, Any]]:
    b = sorted({round(t, 3) for t in boundaries})
    dedup: list[float] = []
    for t in b:
        if not dedup or t > dedup[-1]:
            dedup.append(t)
    shots: list[dict[str, Any]] = []
    for i in range(len(dedup) - 1):
        a, c = dedup[i], dedup[i + 1]
        if c > a:
            shots.append(
                {
                    "index": len(shots) + 1,
                    "start_time": a,
                    "end_time": c,
                    "duration": c - a,
                }
            )
    return shots


def _detect_ensemble_pyscene(video_path: str) -> list[dict[str, Any]]:
    a = _detect_once(video_path, "adaptive")
    c = _detect_once(video_path, "content")
    duration, _fps = _probe_video(video_path)
    d = duration if duration > 0 else max(_endpoints_from_shots(a + c), default=0.0)
    eps = _merge_eps()
    interior = [t for t in _endpoints_from_shots(a + c) if 0 < t < d]
    clustered = _cluster_cut_times(interior, eps)
    extra = _load_extra_boundary_cuts()
    if extra:
        clustered = _cluster_cut_times(clustered + extra, eps)
    boundaries = [0.0] + [t for t in clustered if 0 < t < d] + [d]
    boundaries.sort()
    uniq: list[float] = []
    for t in boundaries:
        if not uniq or t > uniq[-1]:
            uniq.append(round(t, 3))
    out = _shots_from_boundaries(uniq)
    print(f"Ensemble PySceneDetect + NMS: {len(out)} shots in {video_path}")
    return out


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
    """Detect shots using the same detector family as the Node ingest CLI (Phase D: optional ensemble)."""
    if _boundary_ensemble_enabled():
        return _detect_ensemble_pyscene(video_path)

    detector = _effective_detector()
    shots = _detect_once(video_path, detector)
    duration, _fps = _probe_video(video_path)
    extra = _load_extra_boundary_cuts()
    if extra and shots:
        d = duration if duration > 0 else max(_endpoints_from_shots(shots), default=0.0)
        eps = _merge_eps()
        interior = [t for t in _endpoints_from_shots(shots) if 0 < t < d]
        clustered = _cluster_cut_times(interior + extra, eps)
        boundaries = [0.0] + [t for t in clustered if 0 < t < d] + [d]
        boundaries.sort()
        uniq: list[float] = []
        for t in boundaries:
            if not uniq or t > uniq[-1]:
                uniq.append(round(t, 3))
        shots = _shots_from_boundaries(uniq)

    label = detector
    if not shots:
        duration, _fps = _probe_video(video_path)
        print(f"No cuts from PySceneDetect ({label}); using single segment ({duration:.1f}s)")
        return [
            {
                "index": 1,
                "start_time": 0.0,
                "end_time": duration,
                "duration": duration,
            }
        ]

    print(f"Detected {len(shots)} shots ({label}) in {video_path}")
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
