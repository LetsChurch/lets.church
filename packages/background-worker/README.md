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

This worker requires access to **all three S3 buckets**:

#### Ingest Bucket (source files)

| Variable                      | Description                     |
| ----------------------------- | ------------------------------- |
| `S3_INGEST_BUCKET`            | S3 bucket name for source media |
| `S3_INGEST_REGION`            | S3 region                       |
| `S3_INGEST_ENDPOINT`          | S3 endpoint URL                 |
| `S3_INGEST_ACCESS_KEY_ID`     | S3 access key                   |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key                   |

#### Public Bucket (public files)

| Variable                      | Description                     |
| ----------------------------- | ------------------------------- |
| `S3_PUBLIC_BUCKET`            | S3 bucket name for public files |
| `S3_PUBLIC_REGION`            | S3 region                       |
| `S3_PUBLIC_ENDPOINT`          | S3 endpoint URL                 |
| `S3_PUBLIC_ACCESS_KEY_ID`     | S3 access key                   |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | S3 secret key                   |

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
