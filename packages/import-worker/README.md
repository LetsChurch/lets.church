# Import Worker

Temporal worker that handles media import activities from external sources.

## Overview

This worker processes import requests by downloading media from external URLs and uploading them to the ingest S3 bucket.

## Required Configuration

### Environment Variables

| Variable                                  | Description                                | Required |
| ----------------------------------------- | ------------------------------------------ | -------- |
| `IDENTITY`                                | Unique identifier for this worker instance | Yes      |
| `TEMPORAL_ADDRESS`                        | Temporal server address                    | Yes      |
| `TEMPORAL_SHUTDOWN_GRACE_TIME`            | Grace period before shutdown (e.g., "30s") | Yes      |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks              | Yes      |
| `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS` | Max concurrent workflow tasks              | Yes      |
| `SENTRY_DSN`                              | Sentry error tracking DSN                  | Yes      |

### S3 Configuration

S3 access uses the shared **storage-location** contract; see
[`packages/s3/README.md`](../s3/README.md#storage-locations) for the full description. For every
configured location `<ID>` (e.g. `IDRIVE`) this service needs only the ingest bucket:

| Variable                                                                | Description                              |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| `STORAGE_<ID>_INGEST_{BUCKET,ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Ingest bucket (uploaded originals)       |
| `STORAGE_<ID>_INGEST_{REGION,FORCE_PATH_STYLE,MAX_BYTES}`               | Optional; region defaults to `us-east-1` |

## Task Queues

- `IMPORT_QUEUE` - Processes import-media activities
