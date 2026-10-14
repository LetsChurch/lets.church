"""S3 client + progress-update plumbing.

Progress updates are routed through the existing background-queue workflow
`updateUploadRecordWorkflow` via `signalWithStart` — the same path the
TypeScript activities use — so the heavy DB writes happen on the JS worker,
not here.
"""

from __future__ import annotations

import logging

import boto3
from botocore.config import Config
from temporalio.client import Client

from .locations import BucketConfig

logger = logging.getLogger(__name__)

BACKGROUND_QUEUE = "background"
UPDATE_UPLOAD_RECORD_WORKFLOW = "updateUploadRecordWorkflow"
UPDATE_RECORD_SIGNAL = "updateRecord"


def get_s3_client(config: BucketConfig):
    """Build a boto3 S3 client for one storage-location bucket."""
    return boto3.client(
        "s3",
        endpoint_url=config.endpoint,
        region_name=config.region,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
        config=Config(s3={"addressing_style": "path"}) if config.force_path_style else None,
    )


_temporal_client: Client | None = None


def set_temporal_client(client: Client) -> None:
    """Stash the worker's Temporal client so activities can reuse it for signals."""
    global _temporal_client
    _temporal_client = client


def get_temporal_client() -> Client:
    if _temporal_client is None:
        raise RuntimeError("Temporal client not set; call set_temporal_client() in worker startup.")
    return _temporal_client


async def update_upload_record(upload_record_id: str, data: dict) -> None:
    """Signal-with-start the background workflow that owns DB updates for this upload.

    `start_workflow(..., start_signal=...)` is the Python SDK's signalWithStart:
    starts and signals if the workflow isn't running, otherwise just signals.
    """
    client = get_temporal_client()
    workflow_id = f"updateUploadRecord:{upload_record_id}"
    await client.start_workflow(
        UPDATE_UPLOAD_RECORD_WORKFLOW,
        upload_record_id,
        id=workflow_id,
        task_queue=BACKGROUND_QUEUE,
        start_signal=UPDATE_RECORD_SIGNAL,
        start_signal_args=[data],
    )
