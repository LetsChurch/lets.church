# Storage locations

Media lives in one or more **storage locations**. This doc covers the model,
the admin controls, and the production runbooks. The env contract itself is
defined once, in [`packages/s3/README.md`](../packages/s3/README.md#storage-locations).

## Model

- **A location is a paired ingest bucket and public bucket** under one id.
  The ingest bucket holds uploaded originals; the public bucket holds
  processed output (HLS, thumbnails, transcripts, images) behind a CDN.
- **A record never spans locations.** `upload_record.storage_location` picks
  both buckets for the record's source and everything processed from it
  (including its thumbnails). `upload_state.storage_location` records where
  each tracked source object lives. Images carry their own `*_location` column
  next to each image key.
- **Workers without database access are told the location.** Probe,
  transcode, transcribe and import workers get it as an activity argument from
  their workflow; DB-backed activities read the record's current location.
  Workflows started before the deploy (no `storage-locations-v1` patch marker)
  pass nothing and fall back to `idrive`.
- **Ids are permanent.** They are written to the database. Endpoints,
  credentials and bucket names can change; an id cannot be renamed. Existing
  data was backfilled to `idrive`.
- **Locations are discovered from env.** Any non-empty
  `STORAGE_<ID>_{INGEST,PUBLIC}_BUCKET` registers `<id>`; there is no list
  variable. A location needs both buckets configured to accept uploads.
- **Public URLs come from the location.** `STORAGE_<ID>_PUBLIC_URL` replaces
  the old global `MEDIA_URL`. The download service receives it as the signed
  `mediaUrl` JWT claim (falling back to `MEDIA_URL` for tokens from before
  this change, until cleanup); imgproxy only fetches from the URLs listed in
  `IMGPROXY_ALLOWED_SOURCES` (see [`security.md`](security.md#2-treat-any-outbound-request-to-a-user-influenced-destination-as-ssrf)).

### Placement policy

The `storage_location_policy` table holds one row per location, editable on
the admin **Storage Locations** page (`/dashboard/admin/storage`); a location
without a row gets the defaults (weight 1, accepting):

| Column              | Meaning                                                  |
| ------------------- | -------------------------------------------------------- |
| `weight`            | Relative share of new uploads (0 = receive none)         |
| `accepting_uploads` | Off = never place new uploads here (existing data stays) |

Caps filter, weights distribute. A location is eligible when it has both
buckets, is accepting uploads, has a positive weight, and every cap it has
still fits. Among eligible locations, one is picked at random in proportion to
weight.

### Capacity caps

`STORAGE_<ID>_{INGEST,PUBLIC}_MAX_BYTES` (optional; `500GB`, `20TB`, or bytes,
SI units) cap a bucket. Unset means uncapped.

1. **Admission** reserves the source size against ingest and an _estimate_ of
   the processed output against public (`public_reserved_bytes`), using the
   location's observed public/source ratio (clamped; 1× without history). An
   upload whose output won't fit is turned away at admission, not halfway
   through transcoding.
2. **Post-probe re-check.** Once the source is probed, the estimate is
   replaced with a precise one (ladder bitrates × duration) before anything is
   written to public. The outcome is one of:
   - **proceed**: the location still fits; the reservation is updated.
   - **relocate**: it doesn't fit, but another location can hold the whole
     record (source, existing output and new output), so the record moves
     there before processing continues.
   - **park**: nothing fits. Processing waits (`storage_waiting_since` is set)
     until capacity frees up.
3. After processing, the real public bytes are measured into
   `public_size_bytes` and the reservation is released.

### Moves, rebalance and drain

From the admin storage page:

- **Move** one upload record (or an owner's images) to another location.
  Site admins can also move an upload from its page in the dashboard
  (**Admin actions → Move storage location**).
- **Rebalance** moves records between locations toward a byte goal.
- **Drain** a location: set `accepting_uploads` off, then rebalance with no
  target so each record goes wherever placement picks.

Every move locks the record (`upload_record.storage_move_id`), copies,
verifies, then flips the record's location in one transaction. The **source
objects are kept for a grace period (24 hours by default)** before deletion,
so CDN caches and in-flight readers that still hold the old URL keep working.
Rebalances can be paused, resumed and cancelled; progress is tracked in
`storage_move`.

Guard rails:

- Moves refuse records that haven't finished uploading or are still
  transcoding/transcribing, and re-uploads are refused while a record is
  locked. Admin moves may target a location that isn't accepting uploads (or
  has weight 0) but never past its caps.
- Copies are idempotent: an object already at the target with the same size
  (and the same MD5 ETag, when both are single-part) is skipped, so a retried
  or repeated move doesn't re-transfer it.
- Source cleanup is skipped if the record has since moved back to that
  location, and waits while another move holds the record.
- Deleting an upload sweeps its `{id}/` prefix at **every** location, so
  grace-period copies and half-finished moves can't leak.
- The rebalance planner picks the largest records first, so a small byte goal
  can overshoot (one large upload may exceed it). The preview shows exactly
  what will move.

Copies run on a dedicated `storage` task queue (polled by the background
worker) so long transfers can't starve regular background work. Concurrency
per replica is `STORAGE_MOVE_CONCURRENCY` (default 4).

Storage-audit reports are written to the backup bucket under `_audits/` with
the `STANDARD` storage class (not the bucket's `DEEP_ARCHIVE` default), so the
web app needs `S3_BACKUP_*` to sign report download links. Reports from before
this change stay in the old ingest bucket and no longer get a download link.

## Production rollout runbook

Migrating prod from `S3_INGEST_*` / `S3_PUBLIC_*` / `MEDIA_URL` to the single
location `idrive`, with no caps and no second location. Steps 1–3 are
additive: the running (old) code ignores the new keys, so they can land days
ahead of the deploy. Nothing is removed until step 8.

1. **Pre-flight checks (read-only).**
   - List the key names (never values) in the prod imgproxy secret:
     Infisical `/infra/imgproxy`, or
     `kubectl get secret imgproxy-secret -n letschurch-prod -o json | jq '.data | keys'`.
     Note whether `IMGPROXY_ALLOWED_SOURCES` already exists.
   - Confirm the Bunny pull zone `letschurch-media.b-cdn.net` has origin
     iDrive bucket `letschurch-prod-public`, and that an image original
     fetches through it (e.g. `curl -I https://letschurch-media.b-cdn.net/<a channel's avatar_path>`
     returns 200 with an image content type). imgproxy will fetch every
     original this way after the deploy, so hotlink protection or a
     path-restricted pull zone would break all images.
2. **Add the new keys in Infisical.** prod and tnw sync the same paths.
   - `/infra/s3/ingest`: `STORAGE_IDRIVE_INGEST_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`,
     same values as the existing `S3_INGEST_*`.
   - `/infra/s3/public`: `STORAGE_IDRIVE_PUBLIC_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`,
     same values as `S3_PUBLIC_*`, plus
     `STORAGE_IDRIVE_PUBLIC_URL=https://letschurch-media.b-cdn.net`
     (no trailing slash).
   - `/infra/imgproxy`:
     `IMGPROXY_ALLOWED_SOURCES=s3://letschurch-prod-public/,https://letschurch-media.b-cdn.net/`.
     **Keep the `s3://` entry** (and imgproxy's existing S3 settings) for the
     transition: image URLs signed by the old code are cached in browsers,
     the CDN, RSS readers and OIDC `picture` claims, and imgproxy rejects any
     source not on the list. Both entries need their trailing slash.
   - Restart imgproxy and check that existing images still load (the
     allowlist only constrains it; the old `s3://` URLs keep working).
3. **Manifests.** Add `s3-backup-secret` to the web deployment's `envFrom`
   (web signs storage-audit report links, which now live in the backup
   bucket). Optional: `STORAGE_MOVE_CONCURRENCY` on the background worker
   (default 4). No other secret mounts change.
4. **Back up the database** with an on-demand CNPG backup:

   ```sh
   kubectl -n letschurch-prod apply -f - <<'YAML'
   apiVersion: postgresql.cnpg.io/v1
   kind: Backup
   metadata:
     name: letschurch-pg-pre-storage-locations
   spec:
     cluster:
       name: letschurch-pg
     method: barmanObjectStore
   YAML
   kubectl -n letschurch-prod get backup letschurch-pg-pre-storage-locations -w
   ```

   Wait for `completed`. `0031` itself is cheap: constant-default
   `ADD COLUMN` is metadata-only in PostgreSQL, the new indexes are small, and
   nothing existing is dropped or renamed (so the Prisma-era constraint names
   don't matter).
5. **Deploy.** Push to `kyrios`. CI bumps every image (prod and tnw) in one
   `deploy:` commit to the manifests repo and ArgoCD rolls them all at once;
   the first new web or background-worker pod applies `0031` from its
   `db-migrate` init container. No ordering is needed, because each mix of old
   and new pods keeps working:
   - **Old pods can still insert.** `0031` backfills `'idrive'` through column
     defaults and keeps them for this release, so upload records,
     upload-tracking rows and images created by pods that haven't been
     replaced yet still get a location.
   - **Old download links still work.** Tokens signed by old web pods (valid
     for 15 minutes) have no `mediaUrl` claim; the new download service falls
     back to `MEDIA_URL`, which it still gets from `web-config`. The old
     download service ignores the claim.
   - **In-flight workflows are fine.** Ones started before the deploy pass no
     location and fall back to `idrive`; old workers that receive the new
     location argument ignore it and use `S3_INGEST_*` / `S3_PUBLIC_*`, which
     point at the same buckets.
6. **Verify.**
   - `/dashboard/admin/storage` lists `idrive` as complete and uncapped,
     weight 1, accepting uploads.
   - Pages render avatars and thumbnails, and imgproxy logs show no rejected
     sources. Media plays, and a video download works.
   - A new upload, and a mirror-extension upload, finish processing with
     `storage_location = 'idrive'` and a measured `public_size_bytes`.
   - Optionally run a storage audit and download its report from the admin
     page; this proves the web pod can read the backup bucket.
   - Then run the size backfill in a web pod:
     `pnpm --filter @letschurch/web run backfill-public-sizes`. With no caps
     it only feeds the admin page's usage numbers, so it can run whenever.
     It's idempotent and only visits unmeasured uploads (one list call per
     upload).
7. **Drop the defaults in a follow-up release**, once step 5 has fully rolled
   out. Remove `.default('idrive')` from `upload_record.storage_location`,
   `upload_state.storage_location` and the six image `*_location` columns in
   `packages/db/src/schema.ts`, then run
   `just db-generate drop-storage-location-defaults`. Every pod by then names
   a location on insert, so there is no failure window; afterwards a missed
   call site fails loudly instead of silently landing on `idrive`.
8. **Clean up (weeks later).**
   - Remove `S3_INGEST_*` and `S3_PUBLIC_*` from Infisical.
   - Remove the download service's `MEDIA_URL` fallback
     (`services/download/main.go`) and `MEDIA_URL` from the `web-config`
     ConfigMap in the manifests (`prod/kustomization.yml`). Either order is
     safe: without `MEDIA_URL` the fallback is simply off.
   - Once old `s3://` image URLs have aged out of caches, feeds and stored
     emails, remove the `s3://` entry from `IMGPROXY_ALLOWED_SOURCES` and
     imgproxy's S3 settings (`IMGPROXY_USE_S3`, `IMGPROXY_S3_*`, `AWS_*`).

**Rollback.** Before step 7, the old code works against the new schema as is:
roll back the images and leave the new columns and tables in place (a later
re-deploy reuses them). After step 7, restore the defaults out-of-band first,
so rows the old code inserts still get a location:

```sql
ALTER TABLE upload_record ALTER COLUMN storage_location SET DEFAULT 'idrive';
ALTER TABLE upload_state ALTER COLUMN storage_location SET DEFAULT 'idrive';
ALTER TABLE app_user ALTER COLUMN avatar_location SET DEFAULT 'idrive';
ALTER TABLE channel ALTER COLUMN avatar_location SET DEFAULT 'idrive';
ALTER TABLE channel ALTER COLUMN cover_location SET DEFAULT 'idrive';
ALTER TABLE channel ALTER COLUMN default_thumbnail_location SET DEFAULT 'idrive';
ALTER TABLE organization ALTER COLUMN avatar_location SET DEFAULT 'idrive';
ALTER TABLE organization ALTER COLUMN cover_location SET DEFAULT 'idrive';
```

The old env keys stay in place until step 8, so the old code still has what
it needs.

### Adding a location (e.g. RustFS)

1. Create the ingest and public buckets; apply the CORS rules from the
   [root README](../README.md#prereqs) (ingest: `PUT` + exposed `ETag`;
   public: `GET`).
2. Create a Bunny pull zone with the public bucket as origin.
3. Add `STORAGE_RUSTFS_INGEST_*` to `/infra/s3/ingest` and
   `STORAGE_RUSTFS_PUBLIC_*` + `STORAGE_RUSTFS_PUBLIC_URL` to
   `/infra/s3/public` (set `*_FORCE_PATH_STYLE=true` for RustFS; optionally
   `*_MAX_BYTES`).
4. Append `,<STORAGE_RUSTFS_PUBLIC_URL>/` to `IMGPROXY_ALLOWED_SOURCES` in
   `/infra/imgproxy`.
5. Restart the web app, workers, transcribe worker and imgproxy so they pick
   up the env.
6. In the admin storage page, give the location a weight (starting with
   0 lets you test a manual move before it receives new uploads).

## Local development

`.envrc` defaults location `idrive` (`STORAGE_IDRIVE_*`) and composes
`IMGPROXY_ALLOWED_SOURCES` from the configured public URLs. An existing
`.envrc.local` that still sets `S3_INGEST_*` / `S3_PUBLIC_*` / `MEDIA_URL`
must be renamed to `STORAGE_IDRIVE_INGEST_*` / `STORAGE_IDRIVE_PUBLIC_*` /
`STORAGE_IDRIVE_PUBLIC_URL` (then `direnv allow`), or the dev stack falls back
to placeholder buckets. To try
multi-location locally, fill in the commented `STORAGE_RUSTFS_*` block from
`.envrc.local.example`; `docker-compose.yml` passes it through and ignores it
while its buckets are empty. A throwaway RustFS works:

```sh
docker run -d --name lc-dev-rustfs --network letschurch_dev_default \
  --network-alias rustfs -p 127.0.0.1:9010:9000 \
  -e RUSTFS_ACCESS_KEY=rustfsadmin -e RUSTFS_SECRET_KEY=rustfsadmin \
  rustfs/rustfs:latest
```

Create `ingest` and `public` buckets, give `public` an anonymous-read policy
and a GET CORS rule, then set `STORAGE_RUSTFS_*_ENDPOINT=http://rustfs:9000`,
`*_FORCE_PATH_STYLE=true` and
`STORAGE_RUSTFS_PUBLIC_URL=http://localhost:9010/public`. imgproxy runs in a
container and can't reach `localhost:9010`, so images stored there won't
render locally. HLS playback, moves and rebalances work.
