import {
  db,
  StorageLocationPolicy,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import { getLocation, listLocations } from '@letschurch/s3/locations';
import { sql } from 'drizzle-orm';

import {
  chooseLocation,
  type ChooseOptions,
  fitsCaps,
  type LocationCandidate,
  type LocationUsage,
  type Reservation,
  StorageFullError,
} from './placement';

type Db = Pick<typeof db, 'select'>;

const EMPTY_USAGE: LocationUsage = {
  ingestUsed: 0n,
  publicUsed: 0n,
  publicReserved: 0n,
  publicRatio: null,
};

function toBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(String(value));
}

/**
 * Per-location usage from the database. Ingest usage is the sum of tracked
 * source objects; public usage is the sum of measured artifact prefixes.
 * Sums are over indexed columns and cheap enough to run per placement, so
 * there is deliberately no cache: concurrent admissions see each other's
 * reservations.
 */
export async function getLocationUsage(
  client: Db = db,
): Promise<Map<string, LocationUsage>> {
  const [ingestRows, publicRows] = await Promise.all([
    client
      .select({
        location: UploadState.storageLocation,
        used: sql<string>`coalesce(sum(${UploadState.sizeBytes}), 0)`,
      })
      .from(UploadState)
      .groupBy(UploadState.storageLocation),
    client
      .select({
        location: UploadRecord.storageLocation,
        used: sql<string>`coalesce(sum(${UploadRecord.publicSizeBytes}), 0)`,
        reserved: sql<string>`coalesce(sum(${UploadRecord.publicReservedBytes}), 0)`,
        measuredPublic: sql<string>`coalesce(sum(${UploadRecord.publicSizeBytes}) filter (where ${UploadRecord.publicSizeBytes} is not null and ${UploadRecord.uploadSizeBytes} > 0), 0)`,
        measuredSource: sql<string>`coalesce(sum(${UploadRecord.uploadSizeBytes}) filter (where ${UploadRecord.publicSizeBytes} is not null and ${UploadRecord.uploadSizeBytes} > 0), 0)`,
      })
      .from(UploadRecord)
      .groupBy(UploadRecord.storageLocation),
  ]);

  const usage = new Map<string, LocationUsage>();
  const entry = (id: string) => {
    const existing = usage.get(id) ?? { ...EMPTY_USAGE };
    usage.set(id, existing);
    return existing;
  };
  for (const row of ingestRows) {
    entry(row.location).ingestUsed = toBigInt(row.used);
  }
  for (const row of publicRows) {
    const e = entry(row.location);
    e.publicUsed = toBigInt(row.used);
    e.publicReserved = toBigInt(row.reserved);
    const source = Number(row.measuredSource);
    e.publicRatio = source > 0 ? Number(row.measuredPublic) / source : null;
  }
  return usage;
}

export type LocationPolicy = { weight: number; acceptingUploads: boolean };

export const DEFAULT_LOCATION_POLICY: LocationPolicy = {
  weight: 1,
  acceptingUploads: true,
};

export async function getLocationPolicies(
  client: Db = db,
): Promise<Map<string, LocationPolicy>> {
  const rows = await client
    .select({
      locationId: StorageLocationPolicy.locationId,
      weight: StorageLocationPolicy.weight,
      acceptingUploads: StorageLocationPolicy.acceptingUploads,
    })
    .from(StorageLocationPolicy);
  return new Map(rows.map((r) => [r.locationId, r]));
}

/** Every env-configured location joined with its policy and usage. */
export async function getLocationCandidates(
  client: Db = db,
): Promise<LocationCandidate[]> {
  const [usage, policies] = await Promise.all([
    getLocationUsage(client),
    getLocationPolicies(client),
  ]);
  return listLocations().map((location) => {
    const policy = policies.get(location.id) ?? DEFAULT_LOCATION_POLICY;
    return {
      id: location.id,
      complete: location.isComplete,
      weight: policy.weight,
      acceptingUploads: policy.acceptingUploads,
      ingestMax: location.maxBytes('INGEST'),
      publicMax: location.maxBytes('PUBLIC'),
      usage: usage.get(location.id) ?? { ...EMPTY_USAGE },
    };
  });
}

/**
 * Choose a location for a new upload of `sourceBytes`. Throws
 * StorageFullError when no location can take it.
 */
export async function pickLocation(
  options: ChooseOptions,
  client: Db = db,
): Promise<LocationCandidate> {
  const chosen = chooseLocation(await getLocationCandidates(client), options);
  if (!chosen) {
    throw new StorageFullError(options.sourceBytes);
  }
  return chosen;
}

/**
 * Can `locationId` absorb `reservation` on top of what it already holds?
 * Used for re-checks after probe and for admin moves. Caps only — policy
 * (accepting/weight) is the caller's concern.
 */
export async function locationFits(
  locationId: string,
  reservation: Reservation,
  client: Db = db,
): Promise<boolean> {
  const location = getLocation(locationId);
  const usage = (await getLocationUsage(client)).get(locationId) ?? {
    ...EMPTY_USAGE,
  };
  return fitsCaps(
    {
      ingestMax: location.maxBytes('INGEST'),
      publicMax: location.maxBytes('PUBLIC'),
      usage,
    },
    reservation,
  );
}

/** Total bytes (and keys) under `prefix` in one of a location's buckets. */
export async function measurePrefixBytes(
  locationId: string,
  kind: 'INGEST' | 'PUBLIC',
  prefix: string,
): Promise<{ bytes: bigint; keys: Array<{ key: string; size: number }> }> {
  const client = getLocation(locationId).bucket(kind);
  let bytes = 0n;
  const keys: Array<{ key: string; size: number }> = [];
  for await (const entry of client.listObjects(prefix)) {
    if (!entry.Key) continue;
    const size = entry.Size ?? 0;
    bytes += BigInt(size);
    keys.push({ key: entry.Key, size });
  }
  return { bytes, keys };
}
