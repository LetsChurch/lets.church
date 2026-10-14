/**
 * Pure storage-placement logic: which location should hold a new upload.
 *
 * Caps filter, weights distribute. A location is eligible when it is complete
 * (has both buckets), accepting uploads, has a positive weight, and every cap
 * it *has* still fits the reservation — a missing cap always passes. Among
 * eligible locations the winner is drawn at random, proportional to weight.
 *
 * The reservation covers the processed output as well as the source: an
 * upload that fits ingest but whose HLS ladder won't fit public is turned away
 * at admission instead of failing halfway through transcoding.
 *
 * No db/S3 imports here — see ./usage.ts for the queries that feed this.
 */

export type LocationUsage = {
  /** SUM(upload_state.size_bytes) at this location. */
  ingestUsed: bigint;
  /** SUM(upload_record.public_size_bytes) at this location. */
  publicUsed: bigint;
  /** SUM(upload_record.public_reserved_bytes): placed, not yet measured. */
  publicReserved: bigint;
  /** Observed public/source byte ratio, or null without history. */
  publicRatio: number | null;
};

export type LocationCandidate = {
  id: string;
  /** Both buckets configured in env. */
  complete: boolean;
  weight: number;
  acceptingUploads: boolean;
  ingestMax: bigint | null;
  publicMax: bigint | null;
  usage: LocationUsage;
};

export type Reservation = {
  ingestBytes: bigint;
  publicBytes: bigint;
};

/** Ratio used until a location has finished records to learn from. */
export const DEFAULT_PUBLIC_RATIO = 1;
// Clamp observed ratios so a handful of odd uploads (audio-only, tiny
// sources) can't make the estimate absurd in either direction.
const MIN_PUBLIC_RATIO = 0.25;
const MAX_PUBLIC_RATIO = 4;

export function clampPublicRatio(ratio: number | null): number {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return DEFAULT_PUBLIC_RATIO;
  }
  return Math.min(MAX_PUBLIC_RATIO, Math.max(MIN_PUBLIC_RATIO, ratio));
}

/** Estimate the public-bucket bytes an upload of `sourceBytes` will produce. */
export function estimatePublicBytes(
  sourceBytes: bigint,
  ratio: number | null,
): bigint {
  // Ratio in thousandths keeps the math in bigint.
  const milli = BigInt(Math.round(clampPublicRatio(ratio) * 1000));
  return (sourceBytes * milli) / 1000n;
}

export function reservationFor(
  candidate: LocationCandidate,
  sourceBytes: bigint,
): Reservation {
  return {
    ingestBytes: sourceBytes,
    publicBytes: estimatePublicBytes(sourceBytes, candidate.usage.publicRatio),
  };
}

/** Does `reservation` fit under every cap the location has? */
export function fitsCaps(
  candidate: Pick<LocationCandidate, 'ingestMax' | 'publicMax' | 'usage'>,
  reservation: Reservation,
): boolean {
  const { usage } = candidate;
  if (
    candidate.ingestMax !== null &&
    usage.ingestUsed + reservation.ingestBytes > candidate.ingestMax
  ) {
    return false;
  }
  if (
    candidate.publicMax !== null &&
    usage.publicUsed + usage.publicReserved + reservation.publicBytes >
      candidate.publicMax
  ) {
    return false;
  }
  return true;
}

export type ChooseOptions = {
  sourceBytes: bigint;
  /**
   * Exact bytes to reserve, overriding the ratio-based estimate derived from
   * `sourceBytes` (e.g. after probe, or when moving a record whose artifact
   * sizes are already known).
   */
  reservation?: Reservation;
  /** Never choose these ids (e.g. the location being drained). */
  exclude?: ReadonlyArray<string>;
  /**
   * Admin moves may target a location that isn't accepting new uploads, and
   * may target a weight-0 location. Caps are still enforced.
   */
  ignorePolicy?: boolean;
};

export function eligibleLocations(
  candidates: ReadonlyArray<LocationCandidate>,
  {
    sourceBytes,
    reservation,
    exclude = [],
    ignorePolicy = false,
  }: ChooseOptions,
): LocationCandidate[] {
  return candidates.filter(
    (c) =>
      c.complete &&
      !exclude.includes(c.id) &&
      (ignorePolicy || (c.acceptingUploads && c.weight > 0)) &&
      fitsCaps(c, reservation ?? reservationFor(c, sourceBytes)),
  );
}

/**
 * Pick a location for an upload of `sourceBytes`, or null when nothing fits.
 * `random` is injectable for tests.
 */
export function chooseLocation(
  candidates: ReadonlyArray<LocationCandidate>,
  options: ChooseOptions,
  random: () => number = Math.random,
): LocationCandidate | null {
  const eligible = eligibleLocations(candidates, options);
  if (eligible.length === 0) return null;

  // With ignorePolicy a weight-0 location can be eligible; treat weights as
  // at least 1 there so it can still be drawn.
  const weights = eligible.map((c) =>
    options.ignorePolicy ? Math.max(1, c.weight) : c.weight,
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (const [i, candidate] of eligible.entries()) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return candidate;
  }
  return eligible.at(-1) ?? null;
}

export class StorageFullError extends Error {
  override name = 'StorageFullError';

  constructor(readonly sourceBytes: bigint) {
    super(
      `No storage location can accept an upload of ${sourceBytes} bytes. Raise a cap, add a location, or free space.`,
    );
  }
}
