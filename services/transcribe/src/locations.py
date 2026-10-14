"""Storage-location env parsing.

Mirrors the TypeScript contract in `packages/s3/src/locations.ts`. A storage
location is a permanent id (e.g. ``idrive``) paired with one ingest bucket and
one public bucket, configured purely through env key names:

    STORAGE_<ID>_<KIND>_BUCKET
    STORAGE_<ID>_<KIND>_ENDPOINT
    STORAGE_<ID>_<KIND>_REGION            (optional, default us-east-1)
    STORAGE_<ID>_<KIND>_ACCESS_KEY_ID
    STORAGE_<ID>_<KIND>_SECRET_ACCESS_KEY
    STORAGE_<ID>_<KIND>_FORCE_PATH_STYLE  (optional, 'true' or '1')

where ``<ID>`` is the uppercased location id and ``<KIND>`` is ``INGEST`` or
``PUBLIC``. This module is stdlib-only so it can be unit tested without the
heavy model dependencies; `storage.get_s3_client` turns a config into a client.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

BucketKind = Literal["INGEST", "PUBLIC"]

# Workflows started before multi-location storage shipped call
# `transcribe(upload_record_id, s3_upload_key)` with no location. Every
# pre-existing upload record was backfilled to 'idrive' by the migration that
# added `storage_location`, so that is the only correct fallback. Remove once
# no in-flight workflow can still pass two arguments.
LEGACY_STORAGE_LOCATION = "idrive"

DEFAULT_REGION = "us-east-1"

_LOCATION_ID_RE = re.compile(r"^[a-z0-9]+$")
_REQUIRED_FIELDS = ("BUCKET", "ENDPOINT", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY")


@dataclass(frozen=True)
class BucketConfig:
    bucket: str
    endpoint: str
    region: str
    access_key_id: str
    secret_access_key: str
    force_path_style: bool


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def read_bucket_config(
    location_id: str,
    kind: BucketKind,
    env: Mapping[str, str] | None = None,
) -> BucketConfig:
    """Read one bucket's config for a location, raising if any var is missing."""
    if not _LOCATION_ID_RE.match(location_id):
        raise ValueError(f'Invalid storage location id "{location_id}" (expected [a-z0-9]+)')
    if kind not in ("INGEST", "PUBLIC"):
        raise ValueError(f'Invalid storage bucket kind "{kind}" (expected INGEST or PUBLIC)')

    source = os.environ if env is None else env
    prefix = f"STORAGE_{location_id.upper()}_{kind}_"

    def get(field: str) -> str | None:
        return _clean(source.get(f"{prefix}{field}"))

    missing = [f"{prefix}{field}" for field in _REQUIRED_FIELDS if get(field) is None]
    if missing:
        raise ValueError(
            f'Storage location "{location_id}" {kind.lower()} bucket is misconfigured; '
            f"missing: {', '.join(missing)}"
        )

    return BucketConfig(
        bucket=get("BUCKET") or "",
        endpoint=get("ENDPOINT") or "",
        region=get("REGION") or DEFAULT_REGION,
        access_key_id=get("ACCESS_KEY_ID") or "",
        secret_access_key=get("SECRET_ACCESS_KEY") or "",
        force_path_style=get("FORCE_PATH_STYLE") in ("true", "1"),
    )
