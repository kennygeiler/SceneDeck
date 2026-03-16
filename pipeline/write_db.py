from __future__ import annotations

from typing import Any

import psycopg2
from psycopg2.extras import Json

try:
    from .config import DATABASE_URL, require_env
except ImportError:
    from config import DATABASE_URL, require_env


def _upsert_film(cursor: Any, film_data: dict[str, Any]) -> str:
    cursor.execute(
        """
        SELECT id, year
        FROM films
        WHERE title = %s AND director = %s
        LIMIT 1
        """,
        (film_data["title"], film_data["director"]),
    )
    existing = cursor.fetchone()
    if existing:
        film_id, existing_year = existing
        if existing_year is None and film_data.get("year") is not None:
            cursor.execute(
                "UPDATE films SET year = %s WHERE id = %s",
                (film_data["year"], film_id),
            )
        return film_id

    cursor.execute(
        """
        INSERT INTO films (title, director, year)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (film_data["title"], film_data["director"], film_data.get("year")),
    )
    return cursor.fetchone()[0]


def write_to_db(film_data: dict[str, Any], shots_data: list[dict[str, Any]]) -> None:
    database_url = DATABASE_URL or require_env("DATABASE_URL")

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            film_id = _upsert_film(cursor, film_data)

            inserted_shots = 0
            inserted_metadata = 0
            inserted_semantic = 0

            for shot in shots_data:
                cursor.execute(
                    """
                    INSERT INTO shots (
                        film_id,
                        source_file,
                        start_tc,
                        end_tc,
                        duration,
                        video_url,
                        thumbnail_url
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        film_id,
                        shot.get("source_file"),
                        shot.get("start_time"),
                        shot.get("end_time"),
                        shot.get("duration"),
                        shot.get("video_url"),
                        shot.get("thumbnail_url"),
                    ),
                )
                shot_id = cursor.fetchone()[0]
                inserted_shots += 1

                cursor.execute(
                    """
                    INSERT INTO shot_metadata (
                        shot_id,
                        movement_type,
                        direction,
                        speed,
                        shot_size,
                        angle_vertical,
                        angle_horizontal,
                        angle_special,
                        duration_cat,
                        is_compound,
                        compound_parts,
                        classification_source
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        shot_id,
                        shot["movement_type"],
                        shot["direction"],
                        shot["speed"],
                        shot["shot_size"],
                        shot["angle_vertical"],
                        shot["angle_horizontal"],
                        shot.get("angle_special"),
                        shot["duration_cat"],
                        shot["is_compound"],
                        Json(shot.get("compound_parts", [])),
                        shot.get("classification_source", "gemini"),
                    ),
                )
                inserted_metadata += 1

                cursor.execute(
                    """
                    INSERT INTO shot_semantic (
                        shot_id,
                        description,
                        subjects,
                        mood,
                        lighting,
                        technique_notes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        shot_id,
                        shot.get("description"),
                        shot.get("subjects", []),
                        shot.get("mood"),
                        shot.get("lighting"),
                        shot.get("technique_notes"),
                    ),
                )
                inserted_semantic += 1

    print(
        "Database write complete: "
        f"{inserted_shots} shots, "
        f"{inserted_metadata} metadata rows, "
        f"{inserted_semantic} semantic rows."
    )
