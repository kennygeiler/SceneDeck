from __future__ import annotations

from typing import Any

from scenedetect import SceneManager, open_video
from scenedetect.detectors import AdaptiveDetector


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
