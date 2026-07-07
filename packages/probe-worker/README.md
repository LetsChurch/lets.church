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

This worker requires access to the **ingest bucket** only:

| Variable                      | Description                    |
| ----------------------------- | ------------------------------ |
| `S3_INGEST_BUCKET`            | S3 bucket name for media files |
| `S3_INGEST_REGION`            | S3 region                      |
| `S3_INGEST_ENDPOINT`          | S3 endpoint URL                |
| `S3_INGEST_ACCESS_KEY_ID`     | S3 access key                  |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key                  |

### System Requirements

- **ffmpeg/ffprobe** must be installed and available in PATH
- Sufficient disk space for temporary media downloads

## Task Queues

- `PROBE_QUEUE` - Processes probe activities
