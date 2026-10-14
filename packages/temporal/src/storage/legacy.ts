// No DB imports: used by workers without database access (import).

/**
 * The location every pre-multi-location row was backfilled to (migration
 * 0031). Only used to interpret arguments of workflows that were started
 * before the storage-location deploy and still carry the old `'INGEST'`
 * client id (or no location at all). Never use it to place new data.
 */
export const LEGACY_STORAGE_LOCATION = 'idrive';

/** Normalize a workflow-supplied location arg, tolerating pre-deploy values. */
export function locationFromArg(arg: string | null | undefined): string {
  if (!arg || arg === 'INGEST' || arg === 'PUBLIC') {
    return LEGACY_STORAGE_LOCATION;
  }
  return arg;
}
