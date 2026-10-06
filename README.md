# lets.church

## Setup

### Prereqs

1. Setup two S3 (or S3-compatible) buckets on your provider of choice for
   `ingest` and `public`
2. Ensure the `ingest` bucket has the following CORS configuration. Browsers
   (including the YouTube Studio mirror extension,
   [`packages/browser-extension`](packages/browser-extension/README.md), whose
   `chrome-extension://` / `moz-extension://` origins can't be listed
   individually) upload parts directly and must be able to read each `ETag`:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

3. Ensure the `public` bucket has the following CORS configuration:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET"]
  }
]
```

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
