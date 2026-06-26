# Storage Audit Report — JSON Format

This document describes the JSON produced by the storage-audit workflow
(`packages/temporal/src/activities/background/storage-audit.ts`). It is written
so a human **or an LLM** can analyze a report without reading the source.

## What the audit does

The audit is a **read-only** reconciliation of the three S3 buckets against the
database. It never deletes or moves anything. It answers two questions:

1. **Are there extra files?** Every object lives under a top-level prefix
   `{entityId}/…`. A prefix that maps to no live database entity is an
   _orphan_ (a cleanup candidate).
2. **Are expected files missing?** For things the database records exact keys
   for (original uploads, image/avatar/cover/thumbnail paths, HLS master
   playlists, Glacier backups), the object must exist. For HLS, the audit
   walks the playlist tree recursively and verifies every referenced segment.

Buckets:

| Bucket   | Holds                                                                                  |
| -------- | -------------------------------------------------------------------------------------- |
| `INGEST` | Original uploads (`{id}/{uuid}`) + sidecars (`probe.json`, `std{out,err}.txt`, …)       |
| `PUBLIC` | Derived media (HLS playlists/segments, transcripts, peaks, thumbnails), processed images |
| `BACKUP` | Glacier (`DEEP_ARCHIVE`) copies, keyed identically to their source object               |

## Where the JSON lives

| Artifact                | Location                                              | Contents                                              |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Combined report**     | S3 (ingest bucket) `_audits/{auditId}/report.json`   | `{ summary, findings }` — summary + **all** findings  |
| **Per-shard detail**    | S3 (ingest bucket) `_audits/{auditId}/{bucket}/{shardPrefix}.json` | `{ bucket, shardPrefix, objectCount, findings }` |
| **DB summary**          | `storage_audit.summary` (jsonb column)               | The `summary` object only (capped samples, no full findings) |
| **Email**               | Sent to the triggering admin                         | Human-readable summary + a 7-day presigned link to `report.json` |

The combined `report.json` is the canonical artifact to analyze. The presigned
download link in the email points at it. (Note: `totalBytes` / `orphanBytes`
are serialized as **decimal strings** because they are 64-bit integers.)

## Top-level shape of `report.json`

```jsonc
{
  "summary": { /* StorageAuditSummary — see below */ },
  "findings": [ /* AuditFinding[] — every finding, uncapped */ ]
}
```

### `summary` (`StorageAuditSummary`)

```jsonc
{
  "generatedAt": "2026-06-17T03:44:30.000Z",   // ISO 8601, when the report was assembled
  "shardHexLen": 1,                              // 1 → 16 shards/bucket, 2 → 256 (scan granularity)

  // Per-bucket rollups. byte fields are decimal STRINGS (bigint).
  "buckets": {
    "INGEST": {
      "objectCount": 40,         // objects scanned in this bucket
      "totalBytes": "108066",    // sum of object sizes (string)
      "prefixCount": 20,         // distinct top-level {entityId} prefixes seen
      "orphanPrefixCount": 0,    // prefixes flagged as orphans
      "orphanBytes": "0"         // bytes under orphan prefixes (reclaimable, string)
    },
    "PUBLIC": { "objectCount": 3815, "totalBytes": "1229206802", "prefixCount": 28, "orphanPrefixCount": 1, "orphanBytes": "931137" },
    "BACKUP": { "objectCount": 0,    "totalBytes": "0",          "prefixCount": 0,  "orphanPrefixCount": 0, "orphanBytes": "0" }
  },

  // Count of findings keyed by `type` or `type:subtype`. Useful for a quick scan.
  "findingCounts": {
    "ORPHAN_PREFIX:unknown": 1,
    "MISSING_KEY:master": 10,
    "MISSING_KEY:original": 10,
    "MISSING_PREFIX:upload": 10
  },

  // Aggregate totals per finding family.
  "totals": {
    "orphanPrefixes": 1,       // extra files: prefixes with no live entity
    "orphanBackupKeys": 0,     // extra files: backup objects with no BACKED_UP row
    "missingPrefixes": 10,     // a live entity has NO objects at all in a bucket
    "missingKeys": 20,         // an exact expected key is absent
    "missingHlsSegments": 0,   // HLS playlist references a segment that isn't in the bucket
    "brokenHls": 0             // a present playlist could not be read/parsed
  },

  // Up to 100 example findings PER TYPE (the full list is in `findings`).
  "sampleFindings": {
    "ORPHAN_PREFIX": [ /* AuditFinding[] */ ],
    "MISSING_KEY":   [ /* AuditFinding[] */ ]
  },

  "reportKey": "_audits/{auditId}/report.json"   // self-reference (the S3 key of this report)
}
```

> The `summary` stored in the `storage_audit.summary` DB column is identical to
> the above, but `sampleFindings` is the only place findings appear there (the
> uncapped `findings` array exists only in `report.json`).

### `AuditFinding`

Every entry in `findings` and in `sampleFindings[type]` has this shape:

```jsonc
{
  "type": "MISSING_HLS_SEGMENT",   // see table below
  "subtype": "master",             // optional, refines `type`
  "prefix": "a1b2c3d4-…",          // the {entityId} top-level prefix involved (when applicable)
  "key": "a1b2c3d4-…/master.m3u8", // the specific S3 object key (when applicable)
  "detail": "referenced by HLS playlist but absent from bucket" // optional human note
}
```

#### Finding types

| `type`               | Meaning                                                                 | `subtype` values | Has `key`? | Severity / action |
| -------------------- | ----------------------------------------------------------------------- | ---------------- | ---------- | ----------------- |
| `ORPHAN_PREFIX`      | A top-level prefix in INGEST/PUBLIC maps to no **live** entity          | `unknown` (no DB row), `deleted-upload`, `deleted-user`, `deleted-channel`, `deleted-organization` | no (use `prefix`) | Extra files. Cleanup candidate. `deleted-*` = entity soft-deleted but objects not purged; `unknown` = no DB row at all. |
| `ORPHAN_BACKUP_KEY`  | A BACKUP object not referenced by any `BACKED_UP` upload_state row       | (none)           | yes        | Extra files in Glacier. Cleanup candidate. |
| `MISSING_PREFIX`     | A finalized upload has **no** objects at all in this bucket               | `upload` (always) | no (use `prefix`) | Data loss or never-uploaded. Investigate. |
| `MISSING_KEY`        | A specific expected object key is absent                                | `original` (ingest source), `image` (avatar/cover/thumbnail — incl. slug-keyed paths), `master` (HLS master playlist — video uploads only), `audio` (`AUDIO.m3u8` HLS root for audio-only uploads), `backup` (Glacier copy) | yes | Missing file. Severity depends on subtype. |
| `MISSING_HLS_SEGMENT`| An HLS playlist references a key (segment, init, or nested playlist) that isn't in the bucket | (none) | yes | **Broken playback.** High severity. |
| `BROKEN_HLS`         | A present playlist could not be read/parsed during the recursive walk    | (none)           | yes        | Likely corrupt playlist. High severity. |

Notes for interpretation:

- **Orphans answer "are there extra files".** `MISSING_*` answer "are expected
  files missing". A healthy system has all-zero `totals`.
- `MISSING_KEY:master` plus zero `MISSING_HLS_SEGMENT` for the same prefix means
  the whole HLS tree is gone (no master to walk). When a master **is** present
  but segments are not, you get `MISSING_HLS_SEGMENT` entries instead.
- A `master.m3u8` is only ever written for uploads with a **video** variant.
  Audio-only uploads (no `VIDEO*` variant) never have a master — they serve
  `AUDIO.m3u8` as the HLS root, so the audit expects that key (`MISSING_KEY:audio`)
  and walks it for segment integrity. An upload that finished transcoding with
  **no** variants at all (a broken transcode) has no expected playlist; it only
  shows up via its missing ingest prefix.
- `prefix` is usually the entity id (an upload id, or a user/channel/org id),
  but for a `MISSING_KEY:image` it may be a **slug** when the image path is
  slug-keyed (e.g. `dorean-principle/avatar.png`). Use the `key` to locate the
  object; cross-reference image keys against the `avatar_path` / `cover_path` /
  `default_thumbnail_path` columns when the prefix isn't a UUID.
- Bytes are strings; parse with a big-integer-safe routine if summing.

## Per-shard detail files

`_audits/{auditId}/{bucket}/{shardPrefix}.json`:

```jsonc
{
  "bucket": "PUBLIC",
  "shardPrefix": "a",          // hex shard this file covers (keys starting with "a")
  "objectCount": 240,
  "findings": [ /* AuditFinding[] for this shard only */ ]
}
```

These are intermediate outputs (one per `bucket × hex-shard`). `report.json`
already merges all of them, so prefer the combined report unless you are
debugging a single shard.

## Scope caveats

- The scan shards the keyspace by the **leading hex character(s)** of object
  keys. All real keys are `{uuid}/…` or `{entityId}/…` (lowercase hex), so they
  are covered. A stray object whose key starts with a non-hex character
  (`g`–`z`, uppercase, etc.) at `shardHexLen=1` is **not** scanned. The reserved
  `_audits/` prefix is intentionally excluded.
- `upload_state` tracks only **original** files (one row per source upload/image),
  not every derived object. That's why derived media is reconciled by prefix
  presence + HLS-tree walk rather than per-object DB rows.
