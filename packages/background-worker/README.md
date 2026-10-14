# Background Worker

Temporal worker that handles background processing tasks including image processing, backups, notifications, and administrative operations.

## Overview

This worker runs two separate workers:

1. **Background Worker** - Handles general background activities (`BACKGROUND_QUEUE`)
2. **Glacier Worker** - Handles backup operations to S3 Glacier (`GLACIER_QUEUE`)

## Required Configuration

### Environment Variables

| Variable                       | Description                                | Required |
| ------------------------------ | ------------------------------------------ | -------- |
| `IDENTITY`                     | Unique identifier for this worker instance | Yes      |
| `TEMPORAL_ADDRESS`             | Temporal server address                    | Yes      |
| `TEMPORAL_SHUTDOWN_GRACE_TIME` | Grace period before shutdown (e.g., "30s") | Yes      |
| `SENTRY_DSN`                   | Sentry error tracking DSN                  | Yes      |
| `DATABASE_URL`                 | PostgreSQL connection string               | Yes      |
| `ELASTICSEARCH_NODE`           | Elasticsearch node URL                     | Yes      |
| `MAPBOX_GEOCODING_TOKEN`       | Mapbox API token for geocoding             | Yes      |
| `SMTP_*`                       | SMTP configuration for sending emails      | Yes      |

### S3 Configuration

S3 access uses the shared **storage-location** contract; see
[`packages/s3/README.md`](../s3/README.md#storage-locations) for the full description. For every
configured location `<ID>` (e.g. `IDRIVE`) this service needs both buckets:

| Variable                                                                | Description                               |
| ----------------------------------------------------------------------- | ----------------------------------------- |
| `STORAGE_<ID>_INGEST_{BUCKET,ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Ingest bucket (uploaded originals)        |
| `STORAGE_<ID>_INGEST_{REGION,FORCE_PATH_STYLE,MAX_BYTES}`               | Optional; region defaults to `us-east-1`  |
| `STORAGE_<ID>_PUBLIC_{BUCKET,ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` | Public bucket (processed output)          |
| `STORAGE_<ID>_PUBLIC_{REGION,FORCE_PATH_STYLE,MAX_BYTES}`               | Optional; region defaults to `us-east-1`  |
| `STORAGE_<ID>_PUBLIC_URL`                                               | Public CDN base URL for the public bucket |

It also needs the single backup bucket, which is not part of any storage location:

#### Backup Bucket (archives)

| Variable                      | Description                          |
| ----------------------------- | ------------------------------------ |
| `S3_BACKUP_BUCKET`            | S3 bucket name for backups (Glacier) |
| `S3_BACKUP_REGION`            | S3 region                            |
| `S3_BACKUP_ENDPOINT`          | S3 endpoint URL                      |
| `S3_BACKUP_ACCESS_KEY_ID`     | S3 access key                        |
| `S3_BACKUP_SECRET_ACCESS_KEY` | S3 secret key                        |

### System Requirements

- **ImageMagick** for image processing

## Task Queues

- `BACKGROUND_QUEUE` - General background activities
- `GLACIER_QUEUE` - Backup operations (limited to 2 concurrent executions)
