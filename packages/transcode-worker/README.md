# Transcode Worker

Temporal worker that transcodes media files into multiple formats and resolutions for adaptive streaming (HLS).

## Overview

This worker downloads media from the ingest bucket, transcodes it into various quality levels using ffmpeg, and uploads the results to the public bucket for streaming.

## Required Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IDENTITY` | Unique identifier for this worker instance | Yes |
| `TEMPORAL_ADDRESS` | Temporal server address | Yes |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks | Yes |
| `SENTRY_DSN` | Sentry error tracking DSN | Yes |

### S3 Configuration

This worker requires access to **both ingest and public buckets**:

#### Ingest Bucket (source files)

| Variable | Description |
|----------|-------------|
| `S3_INGEST_BUCKET` | S3 bucket name for source media |
| `S3_INGEST_REGION` | S3 region |
| `S3_INGEST_ENDPOINT` | S3 endpoint URL |
| `S3_INGEST_ACCESS_KEY_ID` | S3 access key |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key |

#### Public Bucket (transcoded output)

| Variable | Description |
|----------|-------------|
| `S3_PUBLIC_BUCKET` | S3 bucket name for public media |
| `S3_PUBLIC_REGION` | S3 region |
| `S3_PUBLIC_ENDPOINT` | S3 endpoint URL |
| `S3_PUBLIC_ACCESS_KEY_ID` | S3 access key |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | S3 secret key |

### System Requirements

- **ffmpeg** must be installed and available in PATH
- Significant disk space for transcoding operations (at least 2-3x the size of source files)
- CPU resources for efficient transcoding (optionally accelerated with [MA35D](https://www.amd.com/en/products/accelerators/alveo/ma35d.html))

## Task Queues

- `TRANSCODE_QUEUE` - Processes video transcoding activities
