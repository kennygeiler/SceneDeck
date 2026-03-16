from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

import google.generativeai as genai

try:
    from .config import GEMINI_MODEL_NAME, GOOGLE_API_KEY, require_env
    from .taxonomy import (
        DIRECTIONS,
        DURATION_CATEGORIES,
        HORIZONTAL_ANGLES,
        MOVEMENT_TYPES,
        SHOT_SIZES,
        SPECIAL_ANGLES,
        SPEEDS,
        VERTICAL_ANGLES,
    )
except ImportError:
    from config import GEMINI_MODEL_NAME, GOOGLE_API_KEY, require_env
    from taxonomy import (
        DIRECTIONS,
        DURATION_CATEGORIES,
        HORIZONTAL_ANGLES,
        MOVEMENT_TYPES,
        SHOT_SIZES,
        SPECIAL_ANGLES,
        SPEEDS,
        VERTICAL_ANGLES,
    )


DEFAULT_CLASSIFICATION = {
    "movement_type": "static",
    "direction": "none",
    "speed": "moderate",
    "shot_size": "medium",
    "angle_vertical": "eye_level",
    "angle_horizontal": "frontal",
    "angle_special": None,
    "duration_cat": "standard",
    "is_compound": False,
    "compound_parts": [],
    "description": "",
    "mood": "",
    "lighting": "",
}

_MOVEMENT_TYPE_VALUES = tuple(MOVEMENT_TYPES.keys())
_DIRECTION_VALUES = tuple(DIRECTIONS.keys())
_SPEED_VALUES = tuple(SPEEDS.keys())
_SHOT_SIZE_VALUES = tuple(SHOT_SIZES.keys())
_VERTICAL_ANGLE_VALUES = tuple(VERTICAL_ANGLES.keys())
_HORIZONTAL_ANGLE_VALUES = tuple(HORIZONTAL_ANGLES.keys())
_SPECIAL_ANGLE_VALUES = tuple(SPECIAL_ANGLES.keys())
_DURATION_VALUES = tuple(DURATION_CATEGORIES.keys())

PROMPT_TEMPLATE = """You are a cinematography analysis expert. Analyze this video clip and classify it using ONLY these exact values:

Movement types: {movement_types}

Directions: {directions}

Speeds: {speeds}

Shot sizes: {shot_sizes}

Vertical angles: {vertical_angles}
Horizontal angles: {horizontal_angles}
Special angles: {special_angles} (or null if none apply)

Duration categories: {duration_categories}

Rules:
- Use ONLY taxonomy values from the lists above.
- If the clip appears static, use "static" and direction "none".
- Set is_compound to true only when more than one movement is clearly present.
- compound_parts must contain at most 3 objects, each with exact keys "type" and "direction".
- Respond with ONLY valid JSON and no markdown.

Clip duration (seconds): {clip_duration:.3f}

JSON shape:
{{
  "movement_type": "...",
  "direction": "...",
  "speed": "...",
  "shot_size": "...",
  "angle_vertical": "...",
  "angle_horizontal": "...",
  "angle_special": null or "...",
  "duration_cat": "...",
  "is_compound": false,
  "compound_parts": [],
  "description": "Brief scene description",
  "mood": "Scene mood/atmosphere",
  "lighting": "Lighting description"
}}
"""


def _probe_duration_seconds(video_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def _extract_json_block(response_text: str) -> dict[str, Any]:
    text = response_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Gemini response did not contain a JSON object.")

    return json.loads(text[start : end + 1])


def _validate_value(
    payload: dict[str, Any], key: str, allowed: tuple[str, ...], default: Optional[str]
) -> Optional[str]:
    value = payload.get(key)
    if value in allowed:
        return value
    return default


def _normalize_compound_parts(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw_parts = payload.get("compound_parts")
    if not isinstance(raw_parts, list):
        return []

    normalized: list[dict[str, str]] = []
    for part in raw_parts[:3]:
        if not isinstance(part, dict):
            continue

        movement_type = part.get("type")
        direction = part.get("direction")
        if movement_type in _MOVEMENT_TYPE_VALUES and direction in _DIRECTION_VALUES:
            normalized.append({"type": movement_type, "direction": direction})

    return normalized


def _normalize_response(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(DEFAULT_CLASSIFICATION)
    normalized["movement_type"] = _validate_value(
        payload, "movement_type", _MOVEMENT_TYPE_VALUES, "static"
    )
    normalized["direction"] = _validate_value(
        payload, "direction", _DIRECTION_VALUES, "none"
    )
    normalized["speed"] = _validate_value(payload, "speed", _SPEED_VALUES, "moderate")
    normalized["shot_size"] = _validate_value(
        payload, "shot_size", _SHOT_SIZE_VALUES, "medium"
    )
    normalized["angle_vertical"] = _validate_value(
        payload, "angle_vertical", _VERTICAL_ANGLE_VALUES, "eye_level"
    )
    normalized["angle_horizontal"] = _validate_value(
        payload, "angle_horizontal", _HORIZONTAL_ANGLE_VALUES, "frontal"
    )
    normalized["angle_special"] = _validate_value(
        payload, "angle_special", _SPECIAL_ANGLE_VALUES, None
    )
    normalized["duration_cat"] = _validate_value(
        payload, "duration_cat", _DURATION_VALUES, "standard"
    )
    normalized["description"] = str(payload.get("description") or "").strip()
    normalized["mood"] = str(payload.get("mood") or "").strip()
    normalized["lighting"] = str(payload.get("lighting") or "").strip()

    compound_parts = _normalize_compound_parts(payload)
    normalized["compound_parts"] = compound_parts
    normalized["is_compound"] = bool(payload.get("is_compound")) and bool(compound_parts)

    return normalized


def _upload_and_wait(clip_path: str) -> Any:
    uploaded = genai.upload_file(path=clip_path)
    while getattr(uploaded.state, "name", "") == "PROCESSING":
        time.sleep(2)
        uploaded = genai.get_file(uploaded.name)

    if getattr(uploaded.state, "name", "") == "FAILED":
        raise RuntimeError(f"Gemini file processing failed for {clip_path}.")

    return uploaded


def classify_shot(clip_path: str) -> dict[str, Any]:
    api_key = GOOGLE_API_KEY or require_env("GOOGLE_API_KEY")
    genai.configure(api_key=api_key)

    try:
        clip_duration = _probe_duration_seconds(clip_path)
    except Exception:
        clip_duration = 0.0

    prompt = PROMPT_TEMPLATE.format(
        movement_types=", ".join(_MOVEMENT_TYPE_VALUES),
        directions=", ".join(_DIRECTION_VALUES),
        speeds=", ".join(_SPEED_VALUES),
        shot_sizes=", ".join(_SHOT_SIZE_VALUES),
        vertical_angles=", ".join(_VERTICAL_ANGLE_VALUES),
        horizontal_angles=", ".join(_HORIZONTAL_ANGLE_VALUES),
        special_angles=", ".join(_SPECIAL_ANGLE_VALUES),
        duration_categories=", ".join(_DURATION_VALUES),
        clip_duration=clip_duration,
    )

    last_error: Optional[Exception] = None
    for attempt in range(1, 4):
        uploaded = None
        try:
            uploaded = _upload_and_wait(clip_path)
            model = genai.GenerativeModel(GEMINI_MODEL_NAME)
            response = model.generate_content(
                [prompt, uploaded],
                generation_config={
                    "temperature": 0,
                    "response_mime_type": "application/json",
                },
            )
            payload = _extract_json_block(response.text)
            return _normalize_response(payload)
        except Exception as exc:
            last_error = exc
            if attempt == 3:
                break
            time.sleep(2 ** (attempt - 1))
        finally:
            if uploaded is not None:
                try:
                    genai.delete_file(uploaded.name)
                except Exception:
                    pass

    print(
        f"Gemini classification failed for {Path(clip_path).name}; "
        "falling back to default taxonomy values."
    )
    if last_error is not None:
        print(f"Last Gemini error: {last_error}")
    return dict(DEFAULT_CLASSIFICATION)
