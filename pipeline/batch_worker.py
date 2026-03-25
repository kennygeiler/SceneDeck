"""
Batch worker for bulk film ingestion using Postgres SKIP LOCKED queue.
Polls batch_jobs table, processes films through PySceneDetect + Gemini Batch API.

Usage:
    python -m pipeline.batch_worker
    python pipeline/batch_worker.py
"""

from __future__ import annotations

import json
import signal
import sys
import time
from pathlib import Path
from typing import Any, Optional

import psycopg2

try:
    from .classify import classify_shot
    from .config import DATABASE_URL, require_env, CLIPS_OUTPUT_DIR
    from .extract_clips import extract_clips
    from .rate_limiter import acquire_token
    from .shot_detect import detect_shots
    from .taxonomy import validate_taxonomy_slug
    from .write_db import write_to_db
except ImportError:
    from classify import classify_shot
    from config import DATABASE_URL, require_env, CLIPS_OUTPUT_DIR
    from extract_clips import extract_clips
    from rate_limiter import acquire_token
    from shot_detect import detect_shots
    from taxonomy import validate_taxonomy_slug
    from write_db import write_to_db


_shutdown = False


def _handle_signal(signum: int, frame: Any) -> None:
    global _shutdown
    print(f"\n[batch_worker] Received signal {signum}, shutting down gracefully...")
    _shutdown = True


def _claim_job(conn: Any) -> Optional[dict[str, Any]]:
    """Claim the next pending batch job using SKIP LOCKED."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE batch_jobs
            SET status = 'processing',
                submitted_at = NOW()
            WHERE id = (
                SELECT id FROM batch_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id, film_id
            """,
        )
        row = cur.fetchone()
        conn.commit()
        if row:
            return {"id": row[0], "film_id": row[1]}
    return None


def _complete_job(conn: Any, job_id: str, shot_count: int) -> None:
    """Mark a batch job as completed."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE batch_jobs
            SET status = 'completed',
                result_count = %s,
                completed_at = NOW()
            WHERE id = %s
            """,
            (shot_count, job_id),
        )
        conn.commit()


def _fail_job(conn: Any, job_id: str, error: str) -> None:
    """Mark a batch job as failed."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE batch_jobs
            SET status = 'failed',
                error = %s,
                completed_at = NOW()
            WHERE id = %s
            """,
            (error[:2000], job_id),
        )
        conn.commit()


def _get_film_info(conn: Any, film_id: str) -> Optional[dict[str, Any]]:
    """Fetch film metadata for classification context."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT title, director, year, source_url FROM films WHERE id = %s",
            (film_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "title": row[0],
                "director": row[1],
                "year": row[2],
                "source_url": row[3],
            }
    return None


def _process_film(conn: Any, film_id: str, film_info: dict[str, Any]) -> int:
    """Process a single film: detect shots, extract clips, classify, write to DB."""
    source_url = film_info.get("source_url")
    if not source_url:
        raise ValueError(f"Film {film_id} has no source_url")

    title = film_info["title"]
    director = film_info["director"]
    year = film_info.get("year")

    print(f"  [detect] Running PySceneDetect on {title}...")
    shots = detect_shots(source_url)

    if not shots:
        print(f"  No shots detected for {title}")
        return 0

    print(f"  [extract] Extracting {len(shots)} clips...")
    output_dir = CLIPS_OUTPUT_DIR / Path(source_url).stem
    extract_clips(source_url, shots, str(output_dir))

    print(f"  [classify] Classifying {len(shots)} shots with Gemini...")
    enriched_shots: list[dict[str, Any]] = []
    for shot in shots:
        acquire_token()
        classification = classify_shot(shot["clip_path"])
        classification["classification_source"] = "gemini"

        # Validate taxonomy slugs before accumulating
        for field in (
            "movement_type", "direction", "speed", "shot_size",
            "angle_vertical", "angle_horizontal", "duration_cat",
        ):
            validate_taxonomy_slug(field, classification.get(field))
        validate_taxonomy_slug("angle_special", classification.get("angle_special"))

        enriched_shots.append(
            {
                **shot,
                **classification,
                "source_file": source_url,
                "video_url": shot.get("clip_path", ""),
                "thumbnail_url": shot.get("thumbnail_path", ""),
                "subjects": [],
                "technique_notes": None,
            }
        )

    print(f"  [write] Writing {len(enriched_shots)} shots to DB...")
    write_to_db(
        {"title": title, "director": director, "year": year},
        enriched_shots,
    )

    return len(enriched_shots)


def run_worker(poll_interval: float = 5.0) -> None:
    """Main worker loop. Polls for pending batch jobs and processes them."""
    global _shutdown

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    database_url = DATABASE_URL or require_env("DATABASE_URL")
    conn = psycopg2.connect(database_url)

    print("[batch_worker] Started. Polling for jobs...")

    while not _shutdown:
        job = _claim_job(conn)

        if job is None:
            time.sleep(poll_interval)
            continue

        job_id = job["id"]
        film_id = job["film_id"]
        print(f"[batch_worker] Claimed job {job_id} for film {film_id}")

        try:
            film_info = _get_film_info(conn, film_id)
            if not film_info:
                _fail_job(conn, job_id, f"Film {film_id} not found")
                continue

            print(f"[batch_worker] Processing: {film_info['title']}")
            shot_count = _process_film(conn, film_id, film_info)
            _complete_job(conn, job_id, shot_count)
            print(f"[batch_worker] Completed job {job_id}: {shot_count} shots")
        except Exception as exc:
            print(f"[batch_worker] Job {job_id} failed: {exc}")
            _fail_job(conn, job_id, str(exc))

    conn.close()
    print("[batch_worker] Shutdown complete.")


if __name__ == "__main__":
    run_worker()
