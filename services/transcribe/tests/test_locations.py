"""Env parsing for storage locations (mirrors packages/s3/src/locations.ts)."""

from __future__ import annotations

import pytest

from src.locations import LEGACY_STORAGE_LOCATION, read_bucket_config

BASE_ENV = {
    "STORAGE_IDRIVE_INGEST_BUCKET": "ingest-bucket",
    "STORAGE_IDRIVE_INGEST_ENDPOINT": "https://s3.example.com",
    "STORAGE_IDRIVE_INGEST_ACCESS_KEY_ID": "ingest-key",
    "STORAGE_IDRIVE_INGEST_SECRET_ACCESS_KEY": "ingest-secret",
    "STORAGE_IDRIVE_PUBLIC_BUCKET": "public-bucket",
    "STORAGE_IDRIVE_PUBLIC_ENDPOINT": "https://s3.example.com",
    "STORAGE_IDRIVE_PUBLIC_REGION": "eu-central-1",
    "STORAGE_IDRIVE_PUBLIC_ACCESS_KEY_ID": "public-key",
    "STORAGE_IDRIVE_PUBLIC_SECRET_ACCESS_KEY": "public-secret",
    "STORAGE_IDRIVE_PUBLIC_FORCE_PATH_STYLE": "true",
}


def test_legacy_location_is_idrive():
    assert LEGACY_STORAGE_LOCATION == "idrive"


def test_reads_ingest_config_with_defaults():
    config = read_bucket_config("idrive", "INGEST", BASE_ENV)
    assert config.bucket == "ingest-bucket"
    assert config.endpoint == "https://s3.example.com"
    assert config.region == "us-east-1"
    assert config.access_key_id == "ingest-key"
    assert config.secret_access_key == "ingest-secret"
    assert config.force_path_style is False


def test_reads_public_config_with_overrides():
    config = read_bucket_config("idrive", "PUBLIC", BASE_ENV)
    assert config.bucket == "public-bucket"
    assert config.region == "eu-central-1"
    assert config.force_path_style is True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("1", True), ("true", True), ("false", False), ("", False), ("yes", False)],
)
def test_force_path_style_values(raw: str, expected: bool):
    env = {**BASE_ENV, "STORAGE_IDRIVE_INGEST_FORCE_PATH_STYLE": raw}
    assert read_bucket_config("idrive", "INGEST", env).force_path_style is expected


def test_blank_region_falls_back_to_default():
    env = {**BASE_ENV, "STORAGE_IDRIVE_INGEST_REGION": "  "}
    assert read_bucket_config("idrive", "INGEST", env).region == "us-east-1"


def test_missing_vars_are_named():
    env = {k: v for k, v in BASE_ENV.items() if k != "STORAGE_IDRIVE_INGEST_ENDPOINT"}
    env["STORAGE_IDRIVE_INGEST_SECRET_ACCESS_KEY"] = ""
    with pytest.raises(ValueError) as exc:
        read_bucket_config("idrive", "INGEST", env)
    message = str(exc.value)
    assert "STORAGE_IDRIVE_INGEST_ENDPOINT" in message
    assert "STORAGE_IDRIVE_INGEST_SECRET_ACCESS_KEY" in message
    assert "STORAGE_IDRIVE_INGEST_BUCKET" not in message


def test_unconfigured_location_is_rejected():
    with pytest.raises(ValueError, match="STORAGE_RUSTFS_INGEST_BUCKET"):
        read_bucket_config("rustfs", "INGEST", BASE_ENV)


@pytest.mark.parametrize("location_id", ["IDRIVE", "id-rive", "", "../x", "idrive "])
def test_invalid_location_ids_are_rejected(location_id: str):
    with pytest.raises(ValueError, match="Invalid storage location id"):
        read_bucket_config(location_id, "INGEST", BASE_ENV)


def test_reads_process_env_by_default(monkeypatch: pytest.MonkeyPatch):
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)
    assert read_bucket_config("idrive", "PUBLIC").bucket == "public-bucket"
