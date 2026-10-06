from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.config import get_settings
from fastapi import HTTPException

PRESIGNED_URL_EXPIRY_SECONDS = 3600


def _settings_have_r2_credentials() -> bool:
    settings = get_settings()
    return all(
        [
            settings.r2_endpoint_url,
            settings.r2_access_key_id,
            settings.r2_secret_access_key,
            settings.r2_bucket_name,
        ]
    )


def _s3_client():
    import boto3

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region_name,
    )


def sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-")
    return cleaned or "document"


def build_project_document_key(project_id: UUID, filename: str) -> str:
    now = datetime.now(timezone.utc)
    safe_name = sanitize_filename(filename)
    return f"projects/{project_id}/{now:%Y/%m/%d}/{uuid4()}-{safe_name}"


async def upload_project_document(
    *,
    project_id: UUID,
    filename: str,
    content: bytes,
    content_type: str | None,
) -> tuple[str, str]:
    storage_key = build_project_document_key(project_id, filename)

    if _settings_have_r2_credentials():
        settings = get_settings()
        _s3_client().put_object(
            Bucket=settings.r2_bucket_name,
            Key=storage_key,
            Body=content,
            ContentType=content_type or "application/octet-stream",
        )
        return storage_key, generate_presigned_download_url(storage_key)

    raise HTTPException(status_code=503, detail="Document storage is not configured. Ask an administrator to configure storage and retry.")


def generate_presigned_download_url(storage_key: str) -> str:
    if _settings_have_r2_credentials():
        settings = get_settings()
        return _s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket_name, "Key": storage_key},
            ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
        )

    raise HTTPException(status_code=503, detail="Document storage is unavailable. Please try again after storage is configured.")
