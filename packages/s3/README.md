# @letschurch/s3

S3 client utilities for LetsChurch.

## Overview

This package provides a wrapper around AWS S3 SDK with additional utilities for managing S3 operations including multipart uploads, file management, and presigned URLs.

## Installation

This is a workspace-internal package. It's automatically available to other packages in the monorepo via:

```json
{
  "dependencies": {
    "@letschurch/s3": "workspace:*"
  }
}
```

## Usage

### Basic Setup

```typescript
import { createS3Clients, parseS3Env } from '@letschurch/s3';
import logger from './logger';

const env = parseS3Env();

const { ingestS3, publicS3 } = createS3Clients({
  ingest: {
    bucket: env.S3_INGEST_BUCKET,
    region: env.S3_INGEST_REGION,
    endpoint: env.S3_INGEST_ENDPOINT,
    accessKeyId: env.S3_INGEST_ACCESS_KEY_ID,
    secretAccessKey: env.S3_INGEST_SECRET_ACCESS_KEY,
  },
  public: {
    bucket: env.S3_PUBLIC_BUCKET,
    region: env.S3_PUBLIC_REGION,
    endpoint: env.S3_PUBLIC_ENDPOINT,
    accessKeyId: env.S3_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: env.S3_PUBLIC_SECRET_ACCESS_KEY,
  },
  logger, // Optional pino logger
});
```

### Creating a Client Directly

```typescript
import { LcS3Client } from '@letschurch/s3';

const client = new LcS3Client({
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.amazonaws.com',
  accessKeyId: 'YOUR_ACCESS_KEY',
  secretAccessKey: 'YOUR_SECRET_KEY',
  logger, // Optional
});
```

## API

### LcS3Client

Main S3 client class with the following methods:

- `getS3ProtocolUri(key: string): string` - Get S3 protocol URI
- `createMultipartUpload(key: string, contentType: string)` - Create multipart upload
- `createPresignedPartUploadUrl(uploadId, uploadKey, part)` - Create presigned URL for part upload
- `createPresignedPartUploadUrls(uploadId, uploadKey, size)` - Create presigned URLs for all parts
- `completeMultipartUpload(uploadId, uploadKey, eTags)` - Complete multipart upload
- `abortMultipartUpload(uploadId, uploadKey)` - Abort multipart upload
- `createPresignedUploadUrl(key, contentType)` - Create presigned upload URL
- `headObject(key)` - Get object metadata
- `getObject(key)` - Get object
- `streamObjectToFile(key, path, extra?)` - Stream object to file
- `listObjects(prefix?)` - List objects (async generator)
- `listKeys(prefix?)` - List object keys (async generator)
- `listPrefixes()` - List prefixes (async generator)
- `putFile(options)` - Upload file
- `putFileMultipart(options)` - Upload file using multipart
- `retryablePutFile(options)` - Upload file with retries
- `deleteFile(key)` - Delete file
- `deletePrefix(prefix, heartbeat?)` - Delete all objects with prefix
- `getSignedGetObject(key, options?)` - Get presigned download URL

### Helper Functions

- `parseS3Env()` - Parse S3 environment variables
- `createS3Clients(options)` - Create ingest and public S3 clients
- `getS3Client(clientId, ingestS3, publicS3)` - Get client by ID
- `getPublicUrlWithFilename(publicS3, key, filename)` - Get presigned URL with filename
- `createPresignedPartUploadUrls(client, uploadId, uploadKey, size)` - Create presigned part URLs

## Environment Variables

Required environment variables (parsed by `parseS3Env()`):

- `S3_INGEST_BUCKET`
- `S3_INGEST_REGION`
- `S3_INGEST_ENDPOINT`
- `S3_INGEST_ACCESS_KEY_ID`
- `S3_INGEST_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BUCKET`
- `S3_PUBLIC_REGION`
- `S3_PUBLIC_ENDPOINT`
- `S3_PUBLIC_ACCESS_KEY_ID`
- `S3_PUBLIC_SECRET_ACCESS_KEY`

## Development

```bash
# Build the package
pnpm run build

# Run type checking
pnpm run check:ts

# Run linting
pnpm run check:biome

# Run all checks
pnpm run check

# Fix formatting issues
pnpm run fix
```
