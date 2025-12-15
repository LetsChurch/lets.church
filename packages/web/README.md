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

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `ELASTICSEARCH_NODE` | Elasticsearch node URL | Yes |
| `TEMPORAL_ADDRESS` | Temporal server address | Yes |
| `SENTRY_DSN` | Sentry error tracking DSN | Yes |
| `JWT_SECRET` | Secret for JWT token signing | Yes |
| `SMTP_*` | SMTP configuration for sending emails | Yes |
| `MAPBOX_GEOCODING_TOKEN` | Mapbox API token for geocoding | Yes |
| `IMGPROXY_*` | ImgProxy configuration for image optimization | Yes |
| `LISTMONK_*` | Listmonk configuration for newsletters | Yes |
| `CLOUDFLARE_*` | Cloudflare configuration | Yes |

### S3 Configuration

This application requires access to **ingest and public buckets** (NOT backup):

#### Ingest Bucket (user uploads)

| Variable | Description |
|----------|-------------|
| `S3_INGEST_BUCKET` | S3 bucket name for uploads |
| `S3_INGEST_REGION` | S3 region |
| `S3_INGEST_ENDPOINT` | S3 endpoint URL |
| `S3_INGEST_ACCESS_KEY_ID` | S3 access key |
| `S3_INGEST_SECRET_ACCESS_KEY` | S3 secret key |

#### Public Bucket (served media)

| Variable | Description |
|----------|-------------|
| `S3_PUBLIC_BUCKET` | S3 bucket name for public media |
| `S3_PUBLIC_REGION` | S3 region |
| `S3_PUBLIC_ENDPOINT` | S3 endpoint URL |
| `S3_PUBLIC_ACCESS_KEY_ID` | S3 access key |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | S3 secret key |
