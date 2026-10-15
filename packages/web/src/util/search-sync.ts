import {
  startDeleteSearchDocument,
  startIndexDocument,
  startSyncChannelDocuments,
} from '@/temporal';
import logger from '@/util/logger';

// Keep the search indexes in step with dashboard edits. lc_media_v1,
// lc_channels, and lc_organizations each denormalize DB columns (the media
// access filter reads visibility and channel approval), so a mutation that
// writes one of those columns has to re-sync the affected docs or search keeps
// serving the old values indefinitely.
//
// Every helper is best-effort: callers invoke them after their DB write has
// committed, so a Temporal hiccup is logged rather than failing a save that
// already succeeded.

const moduleLogger = logger.child({ module: 'util/search-sync' });

async function settle(
  label: string,
  ids: string[],
  start: (id: string) => Promise<unknown>,
): Promise<void> {
  const unique = [...new Set(ids)];
  const results = await Promise.allSettled(unique.map((id) => start(id)));
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') continue;
    moduleLogger.warn(
      {
        targetId: unique[i],
        err: r.reason instanceof Error ? r.reason : new Error(String(r.reason)),
      },
      `Failed to start search sync (${label})`,
    );
  }
}

/** Re-index uploads after an edit to their own indexed fields. */
export function reindexUploads(uploadRecordIds: string[]): Promise<void> {
  return settle('media', uploadRecordIds, (id) =>
    startIndexDocument('media', id),
  );
}

/** Re-index organizations (name, description, type, tags, meeting address, approved relationships). */
export function reindexOrganizations(organizationIds: string[]): Promise<void> {
  return settle('organization', organizationIds, (id) =>
    startIndexDocument('organization', id),
  );
}

/**
 * Sync a channel's lc_channels doc and the channel fields (name, visibility,
 * approval) copied onto every one of its uploads' media docs.
 */
export function syncChannelSearch(channelId: string): Promise<void> {
  return settle('channel', [channelId], startSyncChannelDocuments);
}

/** Drop an organization's search doc after its row is deleted. */
export function removeOrganizationFromSearch(
  organizationId: string,
): Promise<void> {
  return settle('organization-delete', [organizationId], (id) =>
    startDeleteSearchDocument('organization', id),
  );
}
