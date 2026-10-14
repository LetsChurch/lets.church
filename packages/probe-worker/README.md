# Probe Worker

Temporal worker that analyzes media files using `ffprobe` to extract metadata (duration, codec, resolution, etc.).

## Overview

This worker downloads media from the ingest S3 bucket, runs `ffprobe` to extract detailed metadata, and stores the results back in S3.

## Required Configuration

### Environment Variables

| Variable                                  | Description                                | Required |
| ----------------------------------------- | ------------------------------------------ | -------- |
| `IDENTITY`                                | Unique identifier for this worker instance | Yes      |
| `TEMPORAL_ADDRESS`                        | Temporal server address                    | Yes      |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks              | Yes      |
| `SENTRY_DSN`                              | Sentry error tracking DSN                  | Yes      |

### S3 Configuration

S3 access uses the shared **storage-location** contract; see
[`packages/s3/README.md`](../s3/README.md#storage-locations) for the full description. For every
configured location `<ID>` (e.g. `IDRIVE`) this service needs only the ingest bucket:

| Variable                                                                | Description                              |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| `STORAGE_<ID>_INGEST_{BUCKET,ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Ingest bucket (uploaded originals)       |
| `STORAGE_<ID>_INGEST_{REGION,FORCE_PATH_STYLE,MAX_BYTES}`               | Optional; region defaults to `us-east-1` |

### System Requirements

- **ffmpeg/ffprobe** must be installed and available in PATH
- Sufficient disk space for temporary media downloads

## Task Queues

- `PROBE_QUEUE` - Processes probe activities
