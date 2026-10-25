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
1. Run `mkcert -install` once per machine to trust the local HTTPS certificates
   (it asks for your password, so run it in a regular terminal)
1. Run `just start` to start the `docker-compose` setup
1. Run `just init` to migrate the database, set up Elasticsearch, and configure Temporal schedules
1. Run `just seed` to seed the database with sample data and upload sample data to S3
1. For host-local editor autocomplete and running scripts outside of docker, run `just pnpmi` to install all project dependencies

The app is at https://main.lc.localhost (web) and https://main.lb.localhost
(lets.bible). To use http://localhost:4000 and :4001 instead, add
`export LC_ROUTING=ports` to `.envrc.local`.

#### Working on several branches at once

Postgres, OpenSearch, Temporal, Valkey, Mailpit, imgproxy and an HTTPS router
run once, as the shared `lc-infra` stack (`just infra-up`; `just start` does it
for you). Each checkout runs only its own app containers against them, with its
own databases, search indices, Temporal namespace and cache. That means any
number of `git worktree`s can run side by side without interfering with each
other:

1. `wt switch --create my-branch` (worktrunk, included in the nix shell) creates
   `../lets.church.my-branch`, copies the main checkout's data into it, and
   starts it at https://my-branch.lc.localhost (lets.bible:
   https://my-branch.lb.localhost)
1. `wt remove my-branch` stops it and deletes everything it created

Without worktrunk, run `just wt-up` in any worktree (`just wt-up fresh` seeds
it from scratch instead of copying) and `just wt-down` before removing it.
`just wt-info` prints a checkout's URLs. Details, including the heavier
services that worktrees opt into, are in [docs/worktrees.md].

[Docker]: https://www.docker.com/products/docker-desktop/
[`direnv`]: https://direnv.net/
[docs/worktrees.md]: docs/worktrees.md
[`git-lfs`]: https://git-lfs.github.com/
[`nix`]: https://nixos.org/download.html
