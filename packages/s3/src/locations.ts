import { z } from 'zod';

import { LcS3Client } from './index.js';

/**
 * Storage locations.
 *
 * A storage location is a stable id paired with one ingest bucket and one
 * public bucket. A record's source upload and every artifact processed from
 * it always live at the same location, so a single persisted
 * `storage_location` column decides both buckets.
 *
 * Locations are discovered from env key names — there is no separate list to
 * keep in sync:
 *
 *   STORAGE_<ID>_INGEST_{BUCKET,ENDPOINT,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}
 *   STORAGE_<ID>_INGEST_{FORCE_PATH_STYLE,MAX_BYTES}           (optional)
 *   STORAGE_<ID>_PUBLIC_{…same…}
 *   STORAGE_<ID>_PUBLIC_URL                                     (CDN base URL)
 *
 * `<ID>` is `[A-Z0-9]+` and is lowercased to form the persisted id. Ids are
 * written to the database, so they are permanent: endpoints, credentials and
 * bucket names may change, an id may not be renamed.
 *
 * Each bucket's vars are validated lazily, on first access, so a service that
 * only mounts the ingest secret (probe, import) never trips over missing
 * public vars.
 */

export type StorageBucketKind = 'INGEST' | 'PUBLIC';

export class UnknownStorageLocationError extends Error {
  override name = 'UnknownStorageLocationError';

  constructor(readonly locationId: string) {
    super(
      `Unknown storage location "${locationId}". Configure STORAGE_${locationId.toUpperCase()}_* or migrate the rows that reference it.`,
    );
  }
}

const BUCKET_KEY_RE = /^STORAGE_([A-Z0-9]+)_(INGEST|PUBLIC)_BUCKET$/;
const LOCATION_ID_RE = /^[a-z0-9]+$/;

const BYTE_UNITS: Record<string, bigint> = {
  B: 1n,
  KB: 1000n,
  MB: 1000n ** 2n,
  GB: 1000n ** 3n,
  TB: 1000n ** 4n,
  PB: 1000n ** 5n,
};

/**
 * Parse a byte size: a plain integer (`1500000000`) or a decimal-unit
 * quantity (`20TB`, `1.5 TB`, `500GB`). Units are SI (1 TB = 10^12 bytes) to
 * match how storage providers bill.
 */
export function parseByteSize(raw: string): bigint {
  const match = raw
    .trim()
    .toUpperCase()
    .match(/^(\d+(?:\.\d+)?)\s*([KMGTP]?B)?$/);
  if (!match) {
    throw new Error(
      `Invalid byte size "${raw}" (expected e.g. 1500000, 500GB, 20TB)`,
    );
  }
  const [, num = '', unit = 'B'] = match;
  const multiplier = BYTE_UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid byte size unit in "${raw}"`);
  }
  const [whole = '0', frac = ''] = num.split('.');
  const scale = 10n ** BigInt(frac.length);
  return (BigInt(whole + frac) * multiplier) / scale;
}

const optionalString = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined || v.trim() === '' ? undefined : v.trim(),
  );

const bucketEnvSchema = z.object({
  BUCKET: z.string().min(1),
  ENDPOINT: z.string().min(1),
  REGION: optionalString.transform((v) => v ?? 'us-east-1'),
  ACCESS_KEY_ID: z.string().min(1),
  SECRET_ACCESS_KEY: z.string().min(1),
  FORCE_PATH_STYLE: optionalString.transform((v) => v === 'true' || v === '1'),
  MAX_BYTES: optionalString.transform((v) =>
    v === undefined ? null : parseByteSize(v),
  ),
});

type BucketConfig = z.infer<typeof bucketEnvSchema>;

type Env = Record<string, string | undefined>;

function readBucketConfig(
  env: Env,
  id: string,
  kind: StorageBucketKind,
): BucketConfig {
  const prefix = `STORAGE_${id.toUpperCase()}_${kind}_`;
  const raw = Object.fromEntries(
    Object.keys(bucketEnvSchema.shape).map((field) => [
      field,
      env[`${prefix}${field}`],
    ]),
  );
  const parsed = bucketEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${prefix}${issue.path.join('.')}`)
      .join(', ');
    throw new Error(
      `Storage location "${id}" ${kind.toLowerCase()} bucket is misconfigured: ${fields}`,
    );
  }
  return parsed.data;
}

export class StorageLocation {
  private ingestClient?: LcS3Client;
  private publicClient?: LcS3Client;
  private ingestConfig?: BucketConfig;
  private publicConfig?: BucketConfig;

  constructor(
    readonly id: string,
    private readonly env: Env,
    /** Which bucket kinds have a BUCKET var in this process's env. */
    readonly configured: Readonly<Record<StorageBucketKind, boolean>>,
  ) {}

  private config(kind: StorageBucketKind): BucketConfig {
    if (kind === 'INGEST') {
      this.ingestConfig ??= readBucketConfig(this.env, this.id, kind);
      return this.ingestConfig;
    }
    this.publicConfig ??= readBucketConfig(this.env, this.id, kind);
    return this.publicConfig;
  }

  private makeClient(kind: StorageBucketKind) {
    const config = this.config(kind);
    return new LcS3Client({
      bucket: config.BUCKET,
      region: config.REGION,
      endpoint: config.ENDPOINT,
      accessKeyId: config.ACCESS_KEY_ID,
      secretAccessKey: config.SECRET_ACCESS_KEY,
      forcePathStyle: config.FORCE_PATH_STYLE,
    });
  }

  get ingest(): LcS3Client {
    this.ingestClient ??= this.makeClient('INGEST');
    return this.ingestClient;
  }

  get public(): LcS3Client {
    this.publicClient ??= this.makeClient('PUBLIC');
    return this.publicClient;
  }

  bucket(kind: StorageBucketKind): LcS3Client {
    return kind === 'INGEST' ? this.ingest : this.public;
  }

  /** Configured cap for a bucket, or null when uncapped. */
  maxBytes(kind: StorageBucketKind): bigint | null {
    return this.configured[kind] ? this.config(kind).MAX_BYTES : null;
  }

  /** Public CDN base URL for this location's public bucket (no trailing slash). */
  get publicUrl(): string {
    const raw = this.env[`STORAGE_${this.id.toUpperCase()}_PUBLIC_URL`]?.trim();
    if (!raw) {
      throw new Error(
        `Storage location "${this.id}" has no STORAGE_${this.id.toUpperCase()}_PUBLIC_URL`,
      );
    }
    return raw.replace(/\/+$/, '');
  }

  /** Public URL for a key in this location's public bucket. */
  publicObjectUrl(key: string): string {
    return `${this.publicUrl}/${key.replace(/^\/+/, '')}`;
  }

  /** True when both buckets exist, i.e. the location can accept new uploads. */
  get isComplete(): boolean {
    return this.configured.INGEST && this.configured.PUBLIC;
  }
}

export class StorageRegistry {
  private readonly locations: ReadonlyMap<string, StorageLocation>;

  constructor(env: Env) {
    const configured = new Map<string, Record<StorageBucketKind, boolean>>();
    for (const [key, value] of Object.entries(env)) {
      const match = key.match(BUCKET_KEY_RE);
      if (!match || !value?.trim()) continue;
      const [, rawId = '', kind] = match;
      const id = rawId.toLowerCase();
      const entry = configured.get(id) ?? { INGEST: false, PUBLIC: false };
      entry[kind as StorageBucketKind] = true;
      configured.set(id, entry);
    }
    this.locations = new Map(
      [...configured.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, kinds]) => [id, new StorageLocation(id, env, kinds)]),
    );
  }

  has(id: string): boolean {
    return this.locations.has(id);
  }

  get(id: string): StorageLocation {
    const location = LOCATION_ID_RE.test(id)
      ? this.locations.get(id)
      : undefined;
    if (!location) {
      throw new UnknownStorageLocationError(id);
    }
    return location;
  }

  list(): StorageLocation[] {
    return [...this.locations.values()];
  }

  ids(): string[] {
    return [...this.locations.keys()];
  }
}

let defaultRegistry: StorageRegistry | undefined;

function registry(): StorageRegistry {
  defaultRegistry ??= new StorageRegistry(process.env);
  return defaultRegistry;
}

/** Look up a location by its persisted id. Throws for unknown ids. */
export function getLocation(id: string): StorageLocation {
  return registry().get(id);
}

/** All locations configured in this process's env, sorted by id. */
export function listLocations(): StorageLocation[] {
  return registry().list();
}

export function isStorageLocationId(id: string): boolean {
  return registry().has(id);
}
