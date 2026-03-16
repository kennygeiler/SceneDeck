from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parent
ENV_PATH = REPO_ROOT / ".env.local"

load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
VERCEL_BLOB_READ_WRITE_TOKEN = os.getenv("VERCEL_BLOB_READ_WRITE_TOKEN")

OUTPUT_ROOT = PIPELINE_DIR / "output"
CLIPS_OUTPUT_DIR = OUTPUT_ROOT / "clips"
THUMBNAILS_OUTPUT_DIR = OUTPUT_ROOT / "thumbnails"
REVIEW_OUTPUT_DIR = OUTPUT_ROOT / "review"
GEMINI_MODEL_NAME = "gemini-2.5-flash"


for directory in (
    OUTPUT_ROOT,
    CLIPS_OUTPUT_DIR,
    THUMBNAILS_OUTPUT_DIR,
    REVIEW_OUTPUT_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable '{name}' in {ENV_PATH}."
        )
    return value
