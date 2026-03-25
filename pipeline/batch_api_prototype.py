"""
AC-24 Risk Gate: Gemini Batch API Video Support Prototype

This script validates whether the Gemini Batch API accepts video files
uploaded via the File API in batch JSONL requests. Run this BEFORE
committing to the batch architecture.

Usage:
    python pipeline/batch_api_prototype.py --clips clip1.mp4 clip2.mp4

What it does:
1. Uploads 5-10 video clips to Gemini File API
2. Creates a JSONL manifest referencing the uploaded files
3. Submits a Batch API job
4. Polls for completion (up to 24h)
5. Parses and validates the results

Expected outcome:
- If this works: Batch API supports video → proceed with batch_worker.py
- If this fails: Fall back to synchronous Python with asyncio at Tier 2 RPM

Environment:
    GOOGLE_API_KEY must be set in .env.local
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("ERROR: google-genai package required. Install: pip install google-genai")
    sys.exit(1)

try:
    from .config import GOOGLE_API_KEY, require_env, GEMINI_MODEL_NAME
except ImportError:
    from config import GOOGLE_API_KEY, require_env, GEMINI_MODEL_NAME


CLASSIFICATION_PROMPT = """Classify this video clip's camera movement.
Return ONLY valid JSON with these fields:
{"movement_type", "direction", "speed", "shot_size", "description"}

movement_type: static/pan/tilt/dolly/truck/pedestal/crane/zoom/handheld/steadicam/drone/aerial/arc/follow/reveal
direction: left/right/up/down/in/out/forward/backward/none
speed: freeze/imperceptible/slow/moderate/fast/very_fast/snap
shot_size: extreme_wide/wide/full/medium_wide/medium/medium_close/close/extreme_close/insert
"""


def upload_clips(client: genai.Client, clip_paths: list[str]) -> list[Any]:
    """Upload video clips to Gemini File API."""
    uploaded = []
    for path in clip_paths:
        print(f"  Uploading {Path(path).name}...")
        f = client.files.upload(file=path)

        # Wait for processing
        while f.state.name == "PROCESSING":
            time.sleep(2)
            f = client.files.get(name=f.name)

        if f.state.name == "FAILED":
            print(f"  WARNING: File processing failed for {path}")
            continue

        uploaded.append(f)
        print(f"  ✓ {Path(path).name} → {f.name} ({f.state.name})")

    return uploaded


def create_batch_jsonl(uploaded_files: list[Any], output_path: str) -> str:
    """Create JSONL manifest for Gemini Batch API."""
    lines = []
    for i, f in enumerate(uploaded_files):
        request = {
            "custom_id": f"clip-{i:03d}",
            "body": {
                "model": f"models/{GEMINI_MODEL_NAME}",
                "contents": [
                    {
                        "parts": [
                            {"file_data": {"file_uri": f.uri, "mime_type": "video/mp4"}},
                            {"text": CLASSIFICATION_PROMPT},
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                },
            },
        }
        lines.append(json.dumps(request))

    Path(output_path).write_text("\n".join(lines), encoding="utf-8")
    print(f"  JSONL manifest written: {output_path} ({len(lines)} requests)")
    return output_path


def submit_batch(client: genai.Client, jsonl_path: str) -> Any:
    """Submit batch job to Gemini Batch API."""
    print("  Submitting batch job...")

    # Note: The exact Batch API interface may vary.
    # This uses the pattern from Google's documentation.
    # If this fails, AC-24 gate is NOT passed.
    try:
        batch = client.batches.create(
            model=f"models/{GEMINI_MODEL_NAME}",
            src=jsonl_path,
        )
        print(f"  ✓ Batch submitted: {batch.name}")
        return batch
    except Exception as e:
        print(f"  ✗ Batch submission FAILED: {e}")
        print("\n  === AC-24 GATE: FAILED ===")
        print("  Gemini Batch API does not support this request format.")
        print("  Fallback: Use synchronous Python with asyncio at Tier 2 RPM.")
        raise


def poll_batch(client: genai.Client, batch_name: str, timeout_minutes: int = 30) -> Any:
    """Poll for batch completion."""
    print(f"  Polling batch {batch_name} (timeout: {timeout_minutes}m)...")
    start = time.time()

    while (time.time() - start) < timeout_minutes * 60:
        batch = client.batches.get(name=batch_name)
        state = getattr(batch, "state", getattr(batch, "status", "UNKNOWN"))

        if hasattr(state, "name"):
            state = state.name

        print(f"    Status: {state}")

        if state in ("SUCCEEDED", "COMPLETED", "JOB_STATE_SUCCEEDED"):
            print("  ✓ Batch completed successfully!")
            return batch
        elif state in ("FAILED", "JOB_STATE_FAILED"):
            print("  ✗ Batch FAILED")
            return batch

        time.sleep(30)

    print(f"  ⚠ Timeout after {timeout_minutes} minutes")
    return None


def validate_results(batch: Any) -> bool:
    """Validate batch results contain structured classification output."""
    try:
        results = getattr(batch, "results", None) or getattr(batch, "output", None)
        if not results:
            print("  No results found on batch object")
            return False

        valid_count = 0
        for result in results:
            try:
                data = json.loads(result) if isinstance(result, str) else result
                body = data.get("body", data)
                if "movement_type" in str(body):
                    valid_count += 1
            except Exception:
                continue

        print(f"  {valid_count} valid classification results")
        return valid_count > 0
    except Exception as e:
        print(f"  Result validation error: {e}")
        return False


def cleanup_files(client: genai.Client, uploaded_files: list[Any]) -> None:
    """Delete uploaded files from Gemini."""
    for f in uploaded_files:
        try:
            client.files.delete(name=f.name)
        except Exception:
            pass
    print(f"  Cleaned up {len(uploaded_files)} uploaded files")


def run_prototype(clip_paths: list[str]) -> None:
    """Run the full AC-24 prototype validation."""
    print("=" * 60)
    print("AC-24 RISK GATE: Gemini Batch API Video Support Prototype")
    print("=" * 60)

    api_key = GOOGLE_API_KEY or require_env("GOOGLE_API_KEY")
    client = genai.Client(api_key=api_key)

    print("\n[1/5] Uploading video clips...")
    uploaded = upload_clips(client, clip_paths)
    if not uploaded:
        print("  ✗ No clips uploaded successfully. Aborting.")
        sys.exit(1)

    jsonl_path = "/tmp/metrovision_batch_prototype.jsonl"

    try:
        print("\n[2/5] Creating JSONL manifest...")
        create_batch_jsonl(uploaded, jsonl_path)

        print("\n[3/5] Submitting batch job...")
        batch = submit_batch(client, jsonl_path)

        print("\n[4/5] Polling for completion...")
        result = poll_batch(client, batch.name)

        print("\n[5/5] Validating results...")
        if result and validate_results(result):
            print("\n" + "=" * 60)
            print("  === AC-24 GATE: PASSED ===")
            print("  Gemini Batch API supports video classification.")
            print("  Proceed with batch_worker.py architecture.")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print("  === AC-24 GATE: FAILED ===")
            print("  Fallback: synchronous Python + asyncio at Tier 2 RPM")
            print("=" * 60)
    finally:
        print("\n[cleanup] Removing uploaded files...")
        cleanup_files(client, uploaded)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AC-24 Gemini Batch API prototype")
    parser.add_argument(
        "--clips",
        nargs="+",
        required=True,
        help="Paths to 5-10 video clips for testing",
    )
    args = parser.parse_args()

    for p in args.clips:
        if not Path(p).exists():
            print(f"ERROR: Clip not found: {p}")
            sys.exit(1)

    run_prototype(args.clips)
