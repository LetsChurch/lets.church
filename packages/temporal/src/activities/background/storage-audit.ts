import {
  AppUser,
  Channel,
  db,
  Organization,
  StorageAudit,
  type StorageAuditStatus,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import type { LcS3Client } from '@letschurch/s3';
import { backupS3 } from '@letschurch/s3/backup';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { heartbeat } from '@temporalio/activity';
import { eq, sql } from 'drizzle-orm';
import { emailHtml, sanitizeForHtml } from '../../util/email';
import { collectReferencedHlsKeys } from '../../util/hls';
import logger from '../../util/logger';
import type { StorageAuditBucket } from '../../workflow-ids';
import sendEmail from './send-email';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/storage-audit',
});

// Reserved top-level prefix where audit reports are written (in the ingest
// bucket). Excluded from orphan classification. Note: hex shard prefixes never
// match a leading underscore, so sharded scans skip it anyway — this is a belt.
export const AUDIT_REPORT_PREFIX = '_audits';

// Per-shard sample cap kept in the compact summary (full findings live in the
// per-shard detail file on S3).
const SHARD_SAMPLE_CAP = 50;
// Per-type sample cap in the combined report summary (DB + email).
const REPORT_SAMPLE_CAP = 100;

type StorageAuditStatusValue = (typeof StorageAuditStatus.enumValues)[number];

export type AuditFindingType =
  | 'ORPHAN_PREFIX'
  | 'ORPHAN_BACKUP_KEY'
  | 'MISSING_PREFIX'
  | 'MISSING_KEY'
  | 'MISSING_HLS_SEGMENT'
  | 'BROKEN_HLS';

export type AuditFinding = {
  type: AuditFindingType;
  subtype?: string;
  prefix?: string;
  key?: string;
  detail?: string;
};

export type ShardSummary = {
  bucket: StorageAuditBucket;
  shardPrefix: string;
  objectCount: number;
  totalBytes: string; // bigint serialized as string
  prefixCount: number;
  orphanPrefixCount: number;
  orphanBytes: string; // bigint serialized as string
  // finding type (or `${type}:${subtype}`) -> count
  counts: Record<string, number>;
  sampleFindings: Array<AuditFinding>;
  detailKey: string;
};

export type StorageAuditSummary = {
  generatedAt: string;
  shardHexLen: number;
  buckets: Record<
    StorageAuditBucket,
    {
      objectCount: number;
      totalBytes: string;
      prefixCount: number;
      orphanPrefixCount: number;
      orphanBytes: string;
    }
  >;
  findingCounts: Record<string, number>;
  totals: {
    orphanPrefixes: number;
    orphanBackupKeys: number;
    missingPrefixes: number;
    missingKeys: number;
    missingHlsSegments: number;
    brokenHls: number;
  };
  sampleFindings: Record<string, Array<AuditFinding>>;
  reportKey: string;
};

function bucketClient(bucket: StorageAuditBucket): LcS3Client {
  switch (bucket) {
    case 'INGEST':
      return ingestS3;
    case 'PUBLIC':
      return publicS3;
    case 'BACKUP':
      return backupS3;
  }
}

// Sidecar artifacts written *next to* a base object as `{baseKey}.<suffix>`
// rather than under a `{baseKey}/` prefix. The image pipeline writes an image's
// ImageMagick probe as `${imageKey}.imagemagick.json` (process-image activity);
// for a bare-uuid image (`{uuid}`) that lands at the top level with no `/`.
// Media probes/logs use `{id}/probe.json` etc. and already group under the
// entity prefix, so only this top-level form needs special handling.
const TOP_LEVEL_SIDECAR_SUFFIXES = ['.imagemagick.json'];

function topLevelPrefix(key: string): string {
  const idx = key.indexOf('/');
  if (idx !== -1) return key.slice(0, idx);
  // No `/`: a bare object or a top-level sidecar. Attribute a sidecar to its
  // base object key so `{uuid}.imagemagick.json` groups with the image `{uuid}`
  // instead of looking like its own unknown entity — a live image's sidecar is
  // then not a false orphan, and a stray sidecar (base deleted) is reported
  // against the base id and deduped with the base object if it's still present.
  for (const suffix of TOP_LEVEL_SIDECAR_SUFFIXES) {
    if (key.length > suffix.length && key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }
  return key;
}

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Expectation sets (loaded per shard, filtered to ids/keys starting with the
// shard's hex prefix so each child only holds its slice of the corpus).
// ---------------------------------------------------------------------------

type EntityKind = 'upload' | 'user' | 'channel' | 'organization';

type EntityInfo = {
  kind: EntityKind;
  deleted: boolean;
  // upload-only:
  finalized?: boolean;
  transcoded?: boolean;
  // Whether the transcode produced any video / audio rendition. Drives which
  // HLS root playlist to expect: video uploads get `{id}/master.m3u8`,
  // audio-only uploads get `{id}/AUDIO.m3u8` (no master is ever written for
  // them — see the transcode activity's master-playlist guard).
  hasVideo?: boolean;
  hasAudio?: boolean;
};

type ExpectedKey = { key: string; subtype: string };

type Expectations = {
  entities: Map<string, EntityInfo>;
  // KEY prefix -> exact keys that must exist in this bucket. Sharded by the
  // key's OWN leading char (not the owning entity's id) so an expected key
  // always lands in the same shard as its object. This matters because image
  // paths are not guaranteed to be `{entityId}/…` — seed data (and any future
  // code path) can key an avatar under a slug, e.g. `dorean-principle/avatar.png`,
  // whose prefix differs from the owning channel/org id.
  expectedKeysByPrefix: Map<string, Array<ExpectedKey>>;
  // Finalized, live upload ids expected to have at least one object in this
  // bucket. Entity-id sharded — an upload's objects always live under `{id}/`,
  // so id and object prefix share a shard.
  expectedUploadPrefixes: Set<string>;
};

async function loadEntities(
  shardPrefix: string,
): Promise<Map<string, EntityInfo>> {
  const len = shardPrefix.length;
  const entities = new Map<string, EntityInfo>();

  const uploads = await db
    .select({
      id: UploadRecord.id,
      deletedAt: UploadRecord.deletedAt,
      finalized: UploadRecord.uploadFinalized,
      transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
      variants: UploadRecord.variants,
    })
    .from(UploadRecord)
    .where(sql`left(${UploadRecord.id}::text, ${len}) = ${shardPrefix}`);
  for (const u of uploads) {
    entities.set(u.id, {
      kind: 'upload',
      deleted: u.deletedAt !== null,
      finalized: u.finalized,
      transcoded: u.transcodingFinishedAt !== null,
      hasVideo: u.variants?.some((v) => v.startsWith('VIDEO')) ?? false,
      hasAudio: u.variants?.includes('AUDIO') ?? false,
    });
  }

  const users = await db
    .select({ id: AppUser.id, deletedAt: AppUser.deletedAt })
    .from(AppUser)
    .where(sql`left(${AppUser.id}::text, ${len}) = ${shardPrefix}`);
  for (const u of users) {
    if (!entities.has(u.id))
      entities.set(u.id, { kind: 'user', deleted: u.deletedAt !== null });
  }

  const channels = await db
    .select({ id: Channel.id, deletedAt: Channel.deletedAt })
    .from(Channel)
    .where(sql`left(${Channel.id}::text, ${len}) = ${shardPrefix}`);
  for (const c of channels) {
    if (!entities.has(c.id))
      entities.set(c.id, { kind: 'channel', deleted: c.deletedAt !== null });
  }

  const orgs = await db
    .select({ id: Organization.id })
    .from(Organization)
    .where(sql`left(${Organization.id}::text, ${len}) = ${shardPrefix}`);
  for (const o of orgs) {
    if (!entities.has(o.id))
      entities.set(o.id, { kind: 'organization', deleted: false });
  }

  return entities;
}

function addExpectedKey(
  map: Map<string, Array<ExpectedKey>>,
  key: string,
  subtype: string,
) {
  const prefix = topLevelPrefix(key);
  const arr = map.get(prefix);
  if (arr) arr.push({ key, subtype });
  else map.set(prefix, [{ key, subtype }]);
}

async function loadIngestExpectations(
  shardPrefix: string,
  entities: Map<string, EntityInfo>,
): Promise<Expectations> {
  const len = shardPrefix.length;
  const expectedKeysByPrefix = new Map<string, Array<ExpectedKey>>();
  const expectedUploadPrefixes = new Set<string>();

  // Original ingest objects tracked in upload_state, sharded by the key prefix.
  const states = await db
    .select({ s3Key: UploadState.s3Key })
    .from(UploadState)
    .where(
      sql`${UploadState.s3Bucket} = ${ingestS3.getBucket()} and left(${UploadState.s3Key}, ${len}) = ${shardPrefix}`,
    );
  for (const s of states) {
    addExpectedKey(expectedKeysByPrefix, s.s3Key, 'original');
  }

  // Any finalized, non-deleted upload should have at least one object in ingest.
  for (const [id, info] of entities) {
    if (info.kind === 'upload' && !info.deleted && info.finalized) {
      expectedUploadPrefixes.add(id);
    }
  }

  return { entities, expectedKeysByPrefix, expectedUploadPrefixes };
}

async function loadPublicExpectations(
  shardPrefix: string,
  entities: Map<string, EntityInfo>,
): Promise<Expectations> {
  const len = shardPrefix.length;
  const expectedKeysByPrefix = new Map<string, Array<ExpectedKey>>();

  // Only add keys that actually belong to THIS shard (their own prefix matches).
  // SQL filters by the key prefix already; this guards the multi-column rows
  // where only some columns fall in this shard.
  const inShard = (k: string | null): k is string =>
    !!k && k.slice(0, len) === shardPrefix;
  const addImage = (k: string | null) => {
    if (inShard(k)) addExpectedKey(expectedKeysByPrefix, k, 'image');
  };

  // upload_state rows that physically live in the public bucket (rare).
  const states = await db
    .select({ s3Key: UploadState.s3Key })
    .from(UploadState)
    .where(
      sql`${UploadState.s3Bucket} = ${publicS3.getBucket()} and left(${UploadState.s3Key}, ${len}) = ${shardPrefix}`,
    );
  for (const s of states)
    addExpectedKey(expectedKeysByPrefix, s.s3Key, 'original');

  // Channel images — sharded by the image PATH (may be slug-keyed), not the id.
  const channels = await db
    .select({
      avatarPath: Channel.avatarPath,
      coverPath: Channel.coverPath,
      defaultThumbnailPath: Channel.defaultThumbnailPath,
    })
    .from(Channel)
    .where(
      sql`${Channel.deletedAt} is null and (left(${Channel.avatarPath}, ${len}) = ${shardPrefix} or left(${Channel.coverPath}, ${len}) = ${shardPrefix} or left(${Channel.defaultThumbnailPath}, ${len}) = ${shardPrefix})`,
    );
  for (const c of channels) {
    addImage(c.avatarPath);
    addImage(c.coverPath);
    addImage(c.defaultThumbnailPath);
  }

  // User avatars.
  const users = await db
    .select({ avatarPath: AppUser.avatarPath })
    .from(AppUser)
    .where(
      sql`${AppUser.deletedAt} is null and left(${AppUser.avatarPath}, ${len}) = ${shardPrefix}`,
    );
  for (const u of users) addImage(u.avatarPath);

  // Organization images.
  const orgs = await db
    .select({
      avatarPath: Organization.avatarPath,
      coverPath: Organization.coverPath,
    })
    .from(Organization)
    .where(
      sql`left(${Organization.avatarPath}, ${len}) = ${shardPrefix} or left(${Organization.coverPath}, ${len}) = ${shardPrefix}`,
    );
  for (const o of orgs) {
    addImage(o.avatarPath);
    addImage(o.coverPath);
  }

  // Upload thumbnails — sharded by the thumbnail PATH.
  const uploadThumbs = await db
    .select({
      defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
      overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
    })
    .from(UploadRecord)
    .where(
      sql`${UploadRecord.deletedAt} is null and (left(${UploadRecord.defaultThumbnailPath}, ${len}) = ${shardPrefix} or left(${UploadRecord.overrideThumbnailPath}, ${len}) = ${shardPrefix})`,
    );
  for (const u of uploadThumbs) {
    addImage(u.defaultThumbnailPath);
    addImage(u.overrideThumbnailPath);
  }

  // HLS root playlist for each finalized, transcoded, live upload. Keyed under
  // `{id}/`, so its prefix is the upload id — already this shard (entities are
  // id-sharded). Video uploads get `master.m3u8`; audio-only uploads never get
  // a master (the transcode activity only writes one when a VIDEO variant
  // exists) and instead serve `AUDIO.m3u8` as the root. Uploads that finished
  // transcoding with no variants at all (a broken transcode) have no playlist
  // to expect here — they surface as a missing ingest prefix instead.
  for (const [id, info] of entities) {
    if (
      info.kind === 'upload' &&
      !info.deleted &&
      info.finalized &&
      info.transcoded
    ) {
      if (info.hasVideo) {
        addExpectedKey(expectedKeysByPrefix, `${id}/master.m3u8`, 'master');
      } else if (info.hasAudio) {
        addExpectedKey(expectedKeysByPrefix, `${id}/AUDIO.m3u8`, 'audio');
      }
    }
  }

  // Public absence of a transcoded upload surfaces as a missing master key (and
  // HLS findings), so there is no separate expected-upload-prefix set here.
  return { entities, expectedKeysByPrefix, expectedUploadPrefixes: new Set() };
}

// ---------------------------------------------------------------------------
// Prefix-group streaming for INGEST / PUBLIC.
// ---------------------------------------------------------------------------

async function auditPrefixBucket(
  auditId: string,
  bucket: 'INGEST' | 'PUBLIC',
  shardPrefix: string,
): Promise<ShardSummary> {
  const client = bucketClient(bucket);
  const entities = await loadEntities(shardPrefix);
  const expectations =
    bucket === 'INGEST'
      ? await loadIngestExpectations(shardPrefix, entities)
      : await loadPublicExpectations(shardPrefix, entities);

  const findings: Array<AuditFinding> = [];
  const counts: Record<string, number> = {};
  let objectCount = 0;
  let totalBytes = 0n;
  let prefixCount = 0;
  let orphanPrefixCount = 0;
  let orphanBytes = 0n;
  const seenPrefixes = new Set<string>();

  // Every expected key starts "pending"; flush() deletes the ones found present.
  // Whatever remains after the full scan is genuinely missing — this catches
  // both "prefix present but key absent" and "prefix never appeared at all".
  const pendingKeys = new Map<string, string>(); // key -> subtype
  for (const arr of expectations.expectedKeysByPrefix.values()) {
    for (const { key, subtype } of arr) pendingKeys.set(key, subtype);
  }

  // Current contiguous group (keys for one prefix arrive together because S3
  // lists lexicographically).
  let currentPrefix: string | null = null;
  let currentKeys = new Map<string, bigint>();
  let currentBytes = 0n;

  const record = (f: AuditFinding) => {
    findings.push(f);
    bump(counts, f.subtype ? `${f.type}:${f.subtype}` : f.type);
  };

  const flush = async () => {
    if (currentPrefix === null) return;
    const prefix = currentPrefix;
    prefixCount += 1;
    seenPrefixes.add(prefix);

    if (prefix === AUDIT_REPORT_PREFIX) {
      currentPrefix = null;
      currentKeys = new Map();
      currentBytes = 0n;
      return;
    }

    const info = entities.get(prefix);
    // A prefix is legitimate if it is a live entity OR it hosts at least one
    // expected key (e.g. a slug-keyed avatar path). Only truly unaccounted-for
    // prefixes — or those of a deleted entity — are orphans.
    const isExpectedHost = expectations.expectedKeysByPrefix.has(prefix);
    if (info?.deleted) {
      record({
        type: 'ORPHAN_PREFIX',
        subtype: `deleted-${info.kind}`,
        prefix,
      });
      orphanPrefixCount += 1;
      orphanBytes += currentBytes;
    } else if (!info && !isExpectedHost) {
      record({ type: 'ORPHAN_PREFIX', subtype: 'unknown', prefix });
      orphanPrefixCount += 1;
      orphanBytes += currentBytes;
    } else {
      // Live entity or expected-key host: mark its present expected keys found.
      for (const { key } of expectations.expectedKeysByPrefix.get(prefix) ??
        []) {
        if (currentKeys.has(key)) pendingKeys.delete(key);
      }

      // Recursive HLS integrity for transcoded uploads (public bucket only).
      // The root playlist is `master.m3u8` for video uploads and `AUDIO.m3u8`
      // for audio-only ones (matching the expected-key logic above).
      const hlsRootKey = info?.hasVideo
        ? `${prefix}/master.m3u8`
        : `${prefix}/AUDIO.m3u8`;
      if (
        bucket === 'PUBLIC' &&
        info?.kind === 'upload' &&
        info.transcoded &&
        currentKeys.has(hlsRootKey)
      ) {
        const present = new Set(currentKeys.keys());
        const { referenced, broken } = await collectReferencedHlsKeys(
          hlsRootKey,
          present,
          (key) => client.getObjectText(key),
        );
        for (const ref of referenced) {
          if (!present.has(ref)) {
            record({
              type: 'MISSING_HLS_SEGMENT',
              prefix,
              key: ref,
              detail: 'referenced by HLS playlist but absent from bucket',
            });
          }
        }
        for (const b of broken) {
          record({
            type: 'BROKEN_HLS',
            prefix,
            key: b,
            detail: 'playlist present but could not be read/parsed',
          });
        }
      }
    }

    currentPrefix = null;
    currentKeys = new Map();
    currentBytes = 0n;
  };

  let sincePage = 0;
  for await (const obj of client.listObjects(shardPrefix, {
    onPage: () => {
      heartbeat(`${bucket}:${shardPrefix} scanned ${objectCount}`);
    },
  })) {
    const key = obj.Key;
    if (!key) continue;
    const size = BigInt(obj.Size ?? 0);
    objectCount += 1;
    totalBytes += size;

    const prefix = topLevelPrefix(key);
    if (prefix !== currentPrefix) {
      await flush();
      currentPrefix = prefix;
    }
    currentKeys.set(key, size);
    currentBytes += size;

    sincePage += 1;
    if (sincePage >= 5000) {
      sincePage = 0;
      heartbeat(`${bucket}:${shardPrefix} scanned ${objectCount}`);
    }
  }
  await flush();

  // Finalized uploads that produced no objects at all in this bucket.
  for (const prefix of expectations.expectedUploadPrefixes) {
    if (!seenPrefixes.has(prefix)) {
      record({
        type: 'MISSING_PREFIX',
        subtype: 'upload',
        prefix,
        detail: 'finalized upload has no objects in this bucket',
      });
    }
  }

  // Expected keys never found present (prefix absent, or present without it).
  for (const [key, subtype] of pendingKeys) {
    record({ type: 'MISSING_KEY', subtype, prefix: topLevelPrefix(key), key });
  }

  return finalizeShard(
    auditId,
    bucket,
    shardPrefix,
    findings,
    counts,
    objectCount,
    totalBytes,
    prefixCount,
    orphanPrefixCount,
    orphanBytes,
  );
}

// ---------------------------------------------------------------------------
// Flat key reconciliation for BACKUP (objects are keyed identically to their
// source, so we reconcile against upload_state.backupKey at the key level).
// ---------------------------------------------------------------------------

async function auditBackupBucket(
  auditId: string,
  shardPrefix: string,
): Promise<ShardSummary> {
  const len = shardPrefix.length;
  const expectedRows = await db
    .select({ backupKey: UploadState.backupKey })
    .from(UploadState)
    .where(
      sql`${UploadState.backupStatus} = 'BACKED_UP' and ${UploadState.backupKey} is not null and left(${UploadState.backupKey}, ${len}) = ${shardPrefix}`,
    );
  const expectedKeys = new Set<string>();
  for (const r of expectedRows) if (r.backupKey) expectedKeys.add(r.backupKey);

  const findings: Array<AuditFinding> = [];
  const counts: Record<string, number> = {};
  let objectCount = 0;
  let totalBytes = 0n;
  let orphanBytes = 0n;
  let orphanPrefixCount = 0;
  const seen = new Set<string>();
  const seenPrefixes = new Set<string>();

  const record = (f: AuditFinding) => {
    findings.push(f);
    bump(counts, f.subtype ? `${f.type}:${f.subtype}` : f.type);
  };

  for await (const obj of backupS3.listObjects(shardPrefix, {
    onPage: () => heartbeat(`BACKUP:${shardPrefix} scanned ${objectCount}`),
  })) {
    const key = obj.Key;
    if (!key) continue;
    objectCount += 1;
    const size = BigInt(obj.Size ?? 0);
    totalBytes += size;
    seenPrefixes.add(topLevelPrefix(key));
    seen.add(key);
    if (!expectedKeys.has(key)) {
      record({ type: 'ORPHAN_BACKUP_KEY', key });
      orphanPrefixCount += 1;
      orphanBytes += size;
    }
  }

  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      record({ type: 'MISSING_KEY', subtype: 'backup', key });
    }
  }

  return finalizeShard(
    auditId,
    'BACKUP',
    shardPrefix,
    findings,
    counts,
    objectCount,
    totalBytes,
    seenPrefixes.size,
    orphanPrefixCount,
    orphanBytes,
  );
}

async function finalizeShard(
  auditId: string,
  bucket: StorageAuditBucket,
  shardPrefix: string,
  findings: Array<AuditFinding>,
  counts: Record<string, number>,
  objectCount: number,
  totalBytes: bigint,
  prefixCount: number,
  orphanPrefixCount: number,
  orphanBytes: bigint,
): Promise<ShardSummary> {
  const detailKey = `${AUDIT_REPORT_PREFIX}/${auditId}/${bucket}/${shardPrefix}.json`;
  await ingestS3.putFile({
    key: detailKey,
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify({ bucket, shardPrefix, objectCount, findings }),
    ),
  });

  moduleLogger.info(
    `Audited ${bucket} shard ${shardPrefix}: ${objectCount} objects, ${findings.length} findings`,
  );

  return {
    bucket,
    shardPrefix,
    objectCount,
    totalBytes: totalBytes.toString(),
    prefixCount,
    orphanPrefixCount,
    orphanBytes: orphanBytes.toString(),
    counts,
    sampleFindings: findings.slice(0, SHARD_SAMPLE_CAP),
    detailKey,
  };
}

/**
 * Audit one (bucket × hex-shard) slice. Read-only and idempotent.
 */
export async function auditShard(
  auditId: string,
  bucket: StorageAuditBucket,
  shardPrefix: string,
): Promise<ShardSummary> {
  if (bucket === 'BACKUP') return auditBackupBucket(auditId, shardPrefix);
  return auditPrefixBucket(auditId, bucket, shardPrefix);
}

// ---------------------------------------------------------------------------
// Report assembly + finalize + email.
// ---------------------------------------------------------------------------

const EMPTY_BUCKET_ROLLUP = {
  objectCount: 0,
  totalBytes: '0',
  prefixCount: 0,
  orphanPrefixCount: 0,
  orphanBytes: '0',
};

// Merge all per-shard summaries + detail files into the combined report
// written to `_audits/{auditId}/report.json`. The on-disk JSON format
// ({ summary, findings }) is documented in docs/storage-audit-report-format.md
// for downstream (human or LLM) analysis — keep that doc in sync with the
// StorageAuditSummary / AuditFinding types above.
export async function assembleStorageAuditReport(
  auditId: string,
  shardSummaries: Array<ShardSummary>,
): Promise<{ reportKey: string; summary: StorageAuditSummary }> {
  const buckets: StorageAuditSummary['buckets'] = {
    INGEST: { ...EMPTY_BUCKET_ROLLUP },
    PUBLIC: { ...EMPTY_BUCKET_ROLLUP },
    BACKUP: { ...EMPTY_BUCKET_ROLLUP },
  };
  const findingCounts: Record<string, number> = {};
  const sampleFindings: Record<string, Array<AuditFinding>> = {};
  const allFindings: Array<AuditFinding> = [];

  for (const shard of shardSummaries) {
    const b = buckets[shard.bucket];
    b.objectCount += shard.objectCount;
    b.totalBytes = (BigInt(b.totalBytes) + BigInt(shard.totalBytes)).toString();
    b.prefixCount += shard.prefixCount;
    b.orphanPrefixCount += shard.orphanPrefixCount;
    b.orphanBytes = (
      BigInt(b.orphanBytes) + BigInt(shard.orphanBytes)
    ).toString();
    for (const [k, v] of Object.entries(shard.counts)) {
      findingCounts[k] = (findingCounts[k] ?? 0) + v;
    }

    // Pull the full per-shard findings back for the combined report.
    try {
      const text = await ingestS3.getObjectText(shard.detailKey);
      const parsed = JSON.parse(text) as { findings?: Array<AuditFinding> };
      for (const f of parsed.findings ?? []) allFindings.push(f);
    } catch (err) {
      moduleLogger.warn(
        `Could not read shard detail ${shard.detailKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Capped samples per finding type for the summary (DB + email).
  for (const f of allFindings) {
    let arr = sampleFindings[f.type];
    if (!arr) {
      arr = [];
      sampleFindings[f.type] = arr;
    }
    if (arr.length < REPORT_SAMPLE_CAP) arr.push(f);
  }

  const totalOf = (prefix: string) =>
    Object.entries(findingCounts)
      .filter(([k]) => k === prefix || k.startsWith(`${prefix}:`))
      .reduce((acc, [, v]) => acc + v, 0);

  const summary: StorageAuditSummary = {
    generatedAt: new Date().toISOString(),
    shardHexLen: shardSummaries[0]?.shardPrefix.length ?? 1,
    buckets,
    findingCounts,
    totals: {
      orphanPrefixes: totalOf('ORPHAN_PREFIX'),
      orphanBackupKeys: totalOf('ORPHAN_BACKUP_KEY'),
      missingPrefixes: totalOf('MISSING_PREFIX'),
      missingKeys: totalOf('MISSING_KEY'),
      missingHlsSegments: totalOf('MISSING_HLS_SEGMENT'),
      brokenHls: totalOf('BROKEN_HLS'),
    },
    sampleFindings,
    reportKey: `${AUDIT_REPORT_PREFIX}/${auditId}/report.json`,
  };

  await ingestS3.putFile({
    key: summary.reportKey,
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ summary, findings: allFindings })),
  });

  return { reportKey: summary.reportKey, summary };
}

export async function finalizeStorageAuditRecord(
  auditId: string,
  status: StorageAuditStatusValue,
  summary?: StorageAuditSummary | null,
  reportS3Key?: string | null,
  error?: string | null,
): Promise<void> {
  await db
    .update(StorageAudit)
    .set({
      status,
      finishedAt: new Date(),
      updatedAt: new Date(),
      ...(summary !== undefined ? { summary } : {}),
      ...(reportS3Key !== undefined ? { reportS3Key } : {}),
      ...(error !== undefined ? { error } : {}),
    })
    .where(eq(StorageAudit.id, auditId));
}

/**
 * Delete an audit's report artifacts (combined report + per-shard detail)
 * under `_audits/{auditId}/` in the ingest bucket. Runs on the background
 * worker (which has the S3 credentials) so the web app never needs to import
 * the S3 clients. The DB row is removed separately by the caller; this only
 * purges storage and is safe to retry (deleting an already-empty prefix is a
 * no-op).
 */
export async function deleteStorageAuditReportObjects(
  auditId: string,
): Promise<void> {
  await ingestS3.deletePrefix(`${AUDIT_REPORT_PREFIX}/${auditId}/`);
}

/**
 * The verified email address of the admin who triggered the audit, if any.
 */
export async function getStorageAuditRecipient(
  triggeredById: string,
): Promise<string | null> {
  const row = await db.query.AppUserEmail.findFirst({
    where: (t, { eq: eqFn, and, isNotNull }) =>
      and(eqFn(t.appUserId, triggeredById), isNotNull(t.verifiedAt)),
  });
  return row?.email ?? null;
}

function formatBytes(bytes: string | bigint): string {
  let n = Number(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function sendStorageAuditEmail(
  to: string,
  summary: StorageAuditSummary,
  reportKey: string,
): Promise<void> {
  const downloadUrl = await ingestS3.getSignedGetObject(reportKey, {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    responseContentDisposition: 'attachment; filename="storage-audit.json"',
  });

  const { totals } = summary;
  const totalIssues =
    totals.orphanPrefixes +
    totals.orphanBackupKeys +
    totals.missingPrefixes +
    totals.missingKeys +
    totals.missingHlsSegments +
    totals.brokenHls;

  const bucketLines = (Object.keys(summary.buckets) as StorageAuditBucket[])
    .map((b) => {
      const r = summary.buckets[b];
      return `${b}: ${r.objectCount.toLocaleString()} objects, ${formatBytes(r.totalBytes)} (${r.orphanPrefixCount.toLocaleString()} orphans, ${formatBytes(r.orphanBytes)})`;
    })
    .join('\n');

  const issueLines = [
    `Orphan prefixes (extra files): ${totals.orphanPrefixes.toLocaleString()}`,
    `Orphan backup objects: ${totals.orphanBackupKeys.toLocaleString()}`,
    `Missing prefixes: ${totals.missingPrefixes.toLocaleString()}`,
    `Missing expected keys: ${totals.missingKeys.toLocaleString()}`,
    `Missing HLS segments (broken playback): ${totals.missingHlsSegments.toLocaleString()}`,
    `Broken HLS playlists: ${totals.brokenHls.toLocaleString()}`,
  ].join('\n');

  const sampleBlocks = Object.entries(summary.sampleFindings)
    .map(([type, items]) => {
      const lines = items
        .slice(0, 20)
        .map(
          (f) =>
            `  - ${f.subtype ? `[${f.subtype}] ` : ''}${f.key ?? f.prefix ?? ''}`,
        )
        .join('\n');
      return `${type} (showing up to 20):\n${lines}`;
    })
    .join('\n\n');

  const text = `Storage audit complete (${summary.generatedAt}).

Total issues: ${totalIssues}

Per bucket:
${bucketLines}

Issues:
${issueLines}

${sampleBlocks}

Full report (expires in 7 days):
${downloadUrl}
`;

  const htmlBody = `
    Storage audit complete at ${sanitizeForHtml(summary.generatedAt)}.

    <b>Total issues: ${totalIssues}</b>

    Per bucket:
    ${sanitizeForHtml(bucketLines).replace(/\n/g, '<br/>')}

    Issues:
    ${sanitizeForHtml(issueLines).replace(/\n/g, '<br/>')}

    <a href="${downloadUrl}">Download the full report</a> (link expires in 7 days).
  `;

  await sendEmail({
    from: 'hello@lets.church',
    to,
    subject: `Storage audit report — ${totalIssues} issue${totalIssues === 1 ? '' : 's'}`,
    text,
    html: emailHtml('Storage Audit Report', htmlBody).html,
  });
}
