import { Channel, db } from '@letschurch/db';
import {
  client as esClient,
  escapeDocument,
  MEDIA_INDEX,
} from '@letschurch/opensearch';
import { Context, sleep } from '@temporalio/activity';
import { eq } from 'drizzle-orm';

import logger from '../../util/logger';
import indexDocument from './index-document';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/sync-channel-documents',
});

const CHANNEL_INDEX = 'lc_channels';
const ORGANIZATION_INDEX = 'lc_organizations';

// How often to poll the update-by-query task (and heartbeat while waiting).
const TASK_POLL_MS = 2_000;

/**
 * Bring a channel's search documents in line with its DB row: the standalone
 * lc_channels doc, plus the channel fields every lc_media_v1 doc denormalizes
 * (channelName / channelVisibility / channelApprovedAt — the media access
 * filter reads the last two). Patched in place with one update-by-query rather
 * than re-indexing each upload, so a large channel costs one OpenSearch task
 * and no re-embedding. Docs that already match are no-ops, so a settings save
 * that didn't touch these fields rewrites nothing.
 *
 * A channel that no longer exists has its lc_channels doc removed; its media
 * docs are removed by the per-upload delete workflows.
 */
export async function syncChannelDocuments(channelId: string): Promise<number> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'syncChannelDocuments',
    channelId,
  });

  const channel = await db
    .select({
      name: Channel.name,
      visibility: Channel.visibility,
      approvedAt: Channel.approvedAt,
    })
    .from(Channel)
    .where(eq(Channel.id, channelId))
    .then((r) => r[0]);

  if (!channel) {
    activityLogger.info('Channel not found; removing its lc_channels doc');
    await esClient.delete(
      { index: CHANNEL_INDEX, id: channelId },
      { ignore: [404] },
    );
    return 0;
  }

  await indexDocument('channel', channelId);

  const started = await esClient.updateByQuery({
    index: MEDIA_INDEX,
    conflicts: 'proceed',
    refresh: true,
    wait_for_completion: false,
    body: {
      query: { term: { channelId } },
      script: {
        lang: 'painless',
        source: `
          if (ctx._source.channelName == params.name &&
              ctx._source.channelVisibility == params.visibility &&
              ctx._source.channelApprovedAt == params.approvedAt) {
            ctx.op = 'noop';
          } else {
            ctx._source.channelName = params.name;
            ctx._source.channelVisibility = params.visibility;
            ctx._source.channelApprovedAt = params.approvedAt;
          }
        `,
        // Same escaping index-document applies to these fields.
        params: escapeDocument({
          name: channel.name,
          visibility: channel.visibility,
          approvedAt: channel.approvedAt?.toISOString() ?? null,
        }),
      },
    },
  });

  // wait_for_completion=false returns { task } instead of the bulk-by-scroll
  // body the client's response type models.
  const taskId = (started.body as { task?: string | number }).task;
  if (!taskId) throw new Error('update_by_query did not return a task id');

  for (;;) {
    Context.current().heartbeat();
    const { body } = await esClient.tasks.get({ task_id: String(taskId) });
    if (body.completed) {
      if (body.error) {
        throw new Error(
          `update_by_query failed: ${JSON.stringify(body.error).slice(0, 500)}`,
        );
      }
      const status = (body.response ?? {}) as {
        updated?: number;
        noops?: number;
        failures?: unknown[];
      };
      if (status.failures && status.failures.length > 0) {
        throw new Error(
          `update_by_query had ${status.failures.length} failures: ${JSON.stringify(status.failures[0]).slice(0, 500)}`,
        );
      }
      activityLogger.info(
        { context: { updated: status.updated, noops: status.noops } },
        'Synced channel fields on media docs',
      );
      return status.updated ?? 0;
    }
    await sleep(TASK_POLL_MS);
  }
}

/**
 * Remove a standalone search doc whose source row was deleted. Media docs are
 * removed by the upload delete workflow (deleteUploadRecordSearch).
 */
export async function deleteSearchDocument(
  kind: 'channel' | 'organization',
  id: string,
): Promise<void> {
  await esClient.delete(
    {
      index: kind === 'channel' ? CHANNEL_INDEX : ORGANIZATION_INDEX,
      id,
    },
    { ignore: [404] },
  );
}
