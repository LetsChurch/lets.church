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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENSEARCH_URL` | OpenSearch node URL |
| `TEMPORAL_ADDRESS` | Temporal server address |
| `JWT_SECRET` | Secret for JWT token signing (hex) |
| `MEDIA_URL` | Base URL for served media assets |
| `IMGPROXY_URL` | imgproxy instance URL |
| `IMGPROXY_KEY` | imgproxy signing key (hex) |
| `IMGPROXY_SALT` | imgproxy signing salt (hex) |
| `WEB_URL` | Public URL of this app (used in emails) |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `MAPBOX_MAP_TOKEN` | Mapbox token for map display |
| `MAPBOX_SEARCHBOX_TOKEN` | Mapbox token for the search box |
| `ZXCVBN_MINIMUM_SCORE` | Minimum password strength score (0–4) |

The following are only required when specific features are exercised at runtime:

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAIL` | Recipient for admin notifications |
| `SENTRY_WEB_SERVER_DSN` | Sentry DSN for server-side error tracking |
| `SMTP_URL` | SMTP connection URL for transactional email |
| `LISTMONK_INTERNAL_URL` | Listmonk newsletter service URL |
| `LISTMONK_API_USER` | Listmonk API username |
| `LISTMONK_API_TOKEN` | Listmonk API token |

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
