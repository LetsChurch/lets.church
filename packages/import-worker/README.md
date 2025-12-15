# Import Worker

Temporal worker that handles media import activities from external sources.

## Overview

This worker processes import requests by downloading media from external URLs and uploading them to the ingest S3 bucket.

## Required Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IDENTITY` | Unique identifier for this worker instance | Yes |
| `TEMPORAL_ADDRESS` | Temporal server address | Yes |
| `TEMPORAL_SHUTDOWN_GRACE_TIME` | Grace period before shutdown (e.g., "30s") | Yes |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks | Yes |
| `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS` | Max concurrent workflow tasks | Yes |
| `SENTRY_DSN` | Sentry error tracking DSN | Yes |

### S3 Configuration

This worker requires access to the **ingest bucket** only:

| Variable | Description |
|----------|-------------|
| `S3_INGEST_BUCKET` | S3 bucket name for uploads |
| `S3_INGEST_REGION` | S3 region |
| `S3_INGEST_ENDPOINT` | S3 endpoint URL |
| `S3_INGEST_ACCESS_KEY_ID` | S3 access key |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key |

## Task Queues

- `IMPORT_QUEUE` - Processes import-media activities
