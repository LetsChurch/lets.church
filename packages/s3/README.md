# @letschurch/s3

S3 client utilities for Let's Church. This package provides a wrapper around AWS S3 SDK with additional utilities for managing S3 operations including multipart uploads, file management, and presigned URLs.

## Storage locations

This is the canonical description of the storage env contract. Other READMEs
link here. The model, admin controls and rollout runbooks live in
[`docs/storage-locations.md`](../../docs/storage-locations.md).

A **storage location** is a permanent id paired with one ingest bucket
(uploaded originals) and one public bucket (processed output served through a
CDN). A record's source and everything processed from it live at the same
location, so the persisted `storage_location` column picks both buckets.

Locations are **discovered from env key names**; there is no list variable.
Every `STORAGE_<ID>_INGEST_BUCKET` or `STORAGE_<ID>_PUBLIC_BUCKET` with a
non-empty value registers location `<id>` (`<ID>` lowercased). A location whose
`BUCKET` var is empty is ignored, so optional locations can be declared with
blank values.

| Variable                                | Required | Description                                                                                  |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `STORAGE_<ID>_INGEST_BUCKET`            | Yes      | Ingest bucket name                                                                           |
| `STORAGE_<ID>_INGEST_ENDPOINT`          | Yes      | S3 endpoint URL                                                                              |
| `STORAGE_<ID>_INGEST_REGION`            | No       | S3 region (default `us-east-1`)                                                              |
| `STORAGE_<ID>_INGEST_ACCESS_KEY_ID`     | Yes      | Access key                                                                                   |
| `STORAGE_<ID>_INGEST_SECRET_ACCESS_KEY` | Yes      | Secret key                                                                                   |
| `STORAGE_<ID>_INGEST_FORCE_PATH_STYLE`  | No       | `true` or `1` for path-style addressing (MinIO, RustFS, …)                                   |
| `STORAGE_<ID>_INGEST_MAX_BYTES`         | No       | Capacity cap: plain bytes or SI units (`500GB`, `20TB`); unset means uncapped                |
| `STORAGE_<ID>_PUBLIC_…`                 |          | Same fields as above, for the public bucket                                                  |
| `STORAGE_<ID>_PUBLIC_URL`               | Yes\*    | Public CDN base URL of the public bucket, no trailing slash (\*for services that build URLs) |

Rules:

- `<ID>` matches `[A-Z0-9]+`. The lowercased id (`STORAGE_IDRIVE_*` →
  `idrive`) is written to the database, so it is **permanent**. Endpoints,
  credentials and bucket names may change; the id may not be renamed.
- Each bucket's vars are validated lazily, on first use, and the error names
  every missing var. A service that only mounts the ingest secret (probe,
  import) never trips over missing public vars.
- A location accepts new uploads only when both of its buckets are configured
  (and its `storage_location_policy` row allows it).
- The backup bucket (`S3_BACKUP_*`) is separate and unchanged: one bucket,
  not part of any location.

In code, use `getLocation(id)` / `listLocations()` from
`@letschurch/s3/locations`; the Python transcribe worker mirrors the same
contract in `services/transcribe/src/locations.py`.

Example (`idrive`, the location existing data was backfilled to):

```sh
STORAGE_IDRIVE_INGEST_BUCKET=letschurch-prod-ingest
STORAGE_IDRIVE_INGEST_ENDPOINT=https://s3.example.com
STORAGE_IDRIVE_INGEST_ACCESS_KEY_ID=…
STORAGE_IDRIVE_INGEST_SECRET_ACCESS_KEY=…
STORAGE_IDRIVE_PUBLIC_BUCKET=letschurch-prod-public
STORAGE_IDRIVE_PUBLIC_ENDPOINT=https://s3.example.com
STORAGE_IDRIVE_PUBLIC_ACCESS_KEY_ID=…
STORAGE_IDRIVE_PUBLIC_SECRET_ACCESS_KEY=…
STORAGE_IDRIVE_PUBLIC_URL=https://letschurch-media.b-cdn.net
```
