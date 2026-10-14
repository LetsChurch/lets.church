# Web Application

The main web application for lets.church, built with TanStack Start, React, and tRPC.

## Overview

This is the primary user-facing application that handles:

- The UI with server-side rendering
- API endpoints via tRPC
- User authentication and sessions
- Media upload coordination

## Required Configuration

### Environment Variables

The following variables are parsed at **module load time** and must be present for the server to start:

| Variable                 | Description                             |
| ------------------------ | --------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string            |
| `OPENSEARCH_URL`         | OpenSearch node URL                     |
| `TEMPORAL_ADDRESS`       | Temporal server address                 |
| `JWT_SECRET`             | Secret for JWT token signing (hex)      |
| `IMGPROXY_URL`           | imgproxy instance URL                   |
| `IMGPROXY_KEY`           | imgproxy signing key (hex)              |
| `IMGPROXY_SALT`          | imgproxy signing salt (hex)             |
| `WEB_URL`                | Public URL of this app (used in emails) |
| `HCAPTCHA_SITE_KEY`      | hCaptcha site key                       |
| `HCAPTCHA_SECRET_KEY`    | hCaptcha secret key                     |
| `MAPBOX_MAP_TOKEN`       | Mapbox token for map display            |
| `MAPBOX_SEARCHBOX_TOKEN` | Mapbox token for the search box         |
| `ZXCVBN_MINIMUM_SCORE`   | Minimum password strength score (0–4)   |

The following are only required when specific features are exercised at runtime:

| Variable                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `ADMIN_EMAIL`           | Recipient for admin notifications           |
| `SENTRY_WEB_SERVER_DSN` | Sentry DSN for server-side error tracking   |
| `SMTP_URL`              | SMTP connection URL for transactional email |
| `LISTMONK_INTERNAL_URL` | Listmonk newsletter service URL             |
| `LISTMONK_API_USER`     | Listmonk API username                       |
| `LISTMONK_API_TOKEN`    | Listmonk API token                          |

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

The backup bucket (`S3_BACKUP_*`) is not used by the web app.
