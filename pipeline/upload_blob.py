from __future__ import annotations

import mimetypes
from pathlib import Path

import httpx

try:
    from .config import VERCEL_BLOB_READ_WRITE_TOKEN, require_env
except ImportError:
    from config import VERCEL_BLOB_READ_WRITE_TOKEN, require_env


VERCEL_BLOB_API_URL = "https://vercel.com/api/blob"


def upload_to_blob(file_path: str, filename: str) -> str:
    token = VERCEL_BLOB_READ_WRITE_TOKEN or require_env(
        "VERCEL_BLOB_READ_WRITE_TOKEN"
    )
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    with open(file_path, "rb") as file_handle:
        response = httpx.put(
            VERCEL_BLOB_API_URL,
            params={"pathname": filename},
            headers={
                "Authorization": f"Bearer {token}",
                "x-vercel-blob-access": "public",
                "x-add-random-suffix": "0",
                "x-allow-overwrite": "1",
                "x-content-type": content_type,
            },
            content=file_handle.read(),
            timeout=120.0,
        )

    response.raise_for_status()
    payload = response.json()
    blob_url = payload.get("url")
    if not blob_url:
        raise RuntimeError(
            f"Vercel Blob upload failed for {Path(file_path).name}: missing blob URL."
        )

    return blob_url
