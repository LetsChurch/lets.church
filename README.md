# lets.church

## Setup

### Prereqs

Media is stored in one or more **storage locations**. Each location has a
permanent id (e.g. `idrive`) and pairs one `ingest` bucket (uploaded
originals) with one `public` bucket (processed output, served through a CDN).
Locations are discovered from `STORAGE_<ID>_*` env vars; see
[`packages/s3/README.md`](packages/s3/README.md#storage-locations) for the env
contract and [`docs/storage-locations.md`](docs/storage-locations.md) for the
model and runbooks.

For **every** location:

1. Create two S3 (or S3-compatible) buckets, `ingest` and `public`.
2. Give the `ingest` bucket this CORS configuration. Browsers upload directly
   with presigned multipart `PUT`s and must be able to read each part's `ETag`.
   This includes the YouTube Studio mirror extension
   ([`packages/browser-extension`](packages/browser-extension/README.md)),
   whose `chrome-extension://` / `moz-extension://` origins can't be listed
   individually, so keep `AllowedOrigins` at `*`:

```json
[
  {
    "AllowedOrigins": [
      "*"
    ],
    "AllowedMethods": [
      "PUT"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ]
  }
]
```

3. Give the `public` bucket this CORS configuration:

```json
[
  {
    "AllowedOrigins": [
      "*"
    ],
    "AllowedMethods": [
      "GET"
    ]
  }
]
```

4. Put a CDN in front of the `public` bucket and set its base URL as
   `STORAGE_<ID>_PUBLIC_URL`.

To add a location, repeat the steps above, set `STORAGE_<NEWID>_INGEST_*`,
`STORAGE_<NEWID>_PUBLIC_*` and `STORAGE_<NEWID>_PUBLIC_URL` for every service
that mounts the storage env, append `${STORAGE_<NEWID>_PUBLIC_URL}/` to
`IMGPROXY_ALLOWED_SOURCES`, and restart. Ids are written to the database, so
pick one you will never need to rename.

### Development Environment

1. Install [`git-lfs`], [Docker], [`nix`], and [`direnv`]
1. Clone this repo
1. Copy `.envrc.local.example` to `.envrc.local` and update the variables to actual values
1. Run `direnv allow` to load the shell environment
1. Run `just start` to start the `docker-compose` setup
1. Run `just init` to migrate the database, set up Elasticsearch, and configure Temporal schedules
1. Run `just seed` to seed the database with sample data and upload sample data to S3
1. For host-local editor autocomplete and running scripts outside of docker, run `just pnpmi` to install all project dependencies

[Docker]: https://www.docker.com/products/docker-desktop/
[`direnv`]: https://direnv.net/
[`git-lfs`]: https://git-lfs.github.com/
[`nix`]: https://nixos.org/download.html
