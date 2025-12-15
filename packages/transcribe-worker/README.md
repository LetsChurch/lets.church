# Transcribe Worker

Temporal worker that generates transcripts and captions for media using Whisper AI.

## Overview

This worker downloads media from the ingest bucket, extracts audio, runs Whisper to generate transcripts, and uploads the results (`VTT`, `JSON`) to the public bucket.

## Required Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `IDENTITY` | Unique identifier for this worker instance | Yes |
| `TEMPORAL_ADDRESS` | Temporal server address | Yes |
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | Max concurrent activity tasks | Yes |
| `SENTRY_DSN` | Sentry error tracking DSN | Yes |
| `WHISPER_MODEL` | Whisper model to use (e.g., "large-v2") | Yes |

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

#### Public Bucket (transcript output)

| Variable | Description |
|----------|-------------|
| `S3_PUBLIC_BUCKET` | S3 bucket name for public transcripts |
| `S3_PUBLIC_REGION` | S3 region |
| `S3_PUBLIC_ENDPOINT` | S3 endpoint URL |
| `S3_PUBLIC_ACCESS_KEY_ID` | S3 access key |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | S3 secret key |

### System Requirements

- **whisper-ctranslate2** must be installed
- **ffmpeg** must be installed for audio extraction
- Sufficient disk space for audio extraction and processing
- GPU recommended for faster transcription

## Task Queues

- `TRANSCRIBE_QUEUE` - Processes transcription activities
