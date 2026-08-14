import {
  ChannelLiveStream,
  ChannelSimulcastTarget,
  db,
  UploadListEntry,
  UploadRecord,
} from '@letschurch/db';
import { readRequestBody, RequestBodyTooLargeError } from '@letschurch/util';
import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';

import { signalMuxRenditionReady, startMuxImportRecording } from '@/temporal';
import logger from '@/util/logger';
import { getMux, getMuxWebhookSecret } from '@/util/mux';

const moduleLogger = logger.child({ module: 'routes/webhooks/mux' });

// Mux event envelopes contain asset/live-stream metadata rather than media.
// One MiB leaves generous room for event arrays while bounding verification.
export const MUX_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;

// Create the UploadRecord for a broadcast that just went live, applying the
// channel's pre-set "next broadcast" metadata. Idempotent on muxAssetId so a
// duplicate `active` delivery (or a reconnect) doesn't create a second record.
export async function handleLiveStreamActive(data: {
  id: string;
  active_asset_id?: string | null;
}) {
  const liveStream = await db.query.ChannelLiveStream.findFirst({
    where: (t, { eq }) => eq(t.muxLiveStreamId, data.id),
    with: { channel: true },
  });
  if (!liveStream) {
    moduleLogger.warn(
      { context: { muxLiveStreamId: data.id } },
      'No channel live stream',
    );
    return;
  }

  await db
    .update(ChannelLiveStream)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(ChannelLiveStream.id, liveStream.id));

  const assetId = data.active_asset_id;
  if (!assetId) {
    moduleLogger.warn(
      { context: { muxLiveStreamId: data.id } },
      'active without asset id',
    );
    return;
  }

  const existing = await db.query.UploadRecord.findFirst({
    where: (t, { eq }) => eq(t.muxAssetId, assetId),
  });
  if (existing) {
    return;
  }

  const channel = liveStream.channel;
  const appUserId = liveStream.createdById ?? channel.approvedById;
  if (!appUserId) {
    moduleLogger.error(
      { channelId: liveStream.channelId },
      'No owner to attribute live broadcast to; skipping record creation',
    );
    return;
  }

  const [created] = await db
    .insert(UploadRecord)
    .values({
      title: liveStream.nextTitle ?? `${channel.name} — Live`,
      description: liveStream.nextDescription ?? null,
      appUserId,
      channelId: liveStream.channelId,
      license:
        liveStream.nextLicense ?? channel.defaultUploadLicense ?? 'STANDARD',
      visibility:
        liveStream.nextVisibility ??
        channel.defaultUploadVisibility ??
        'PUBLIC',
      userCommentsEnabled:
        liveStream.nextCommentsEnabled ??
        channel.defaultUploadCommentsEnabled ??
        true,
      downloadsEnabled:
        liveStream.nextDownloadsEnabled ??
        channel.defaultUploadDownloadsEnabled ??
        true,
      isLiveBroadcast: true,
      muxAssetId: assetId,
      muxPlaybackId: liveStream.muxPlaybackId,
      liveStartedAt: new Date(),
      publishedAt: new Date(),
      uploadFinalized: false,
      transcodingProgress: 0,
      variants: [],
      score: 0,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: UploadRecord.muxAssetId })
    .returning({ id: UploadRecord.id });

  if (!created) {
    const concurrentExisting = await db.query.UploadRecord.findFirst({
      where: (t, { eq }) => eq(t.muxAssetId, assetId),
    });
    if (concurrentExisting) {
      return;
    }
    throw new Error(
      'Mux asset insert conflicted without an existing upload record',
    );
  }

  // Add the broadcast to the configured series, if it still belongs to this
  // channel (nextSeriesId has no FK, so verify before inserting).
  if (liveStream.nextSeriesId) {
    const series = await db.query.UploadList.findFirst({
      columns: { id: true },
      where: (t, { and, eq }) =>
        and(
          eq(t.id, liveStream.nextSeriesId as string),
          eq(t.channelId, liveStream.channelId),
        ),
    });
    if (series) {
      await db
        .insert(UploadListEntry)
        .values({
          uploadListId: series.id,
          uploadRecordId: created.id,
        })
        // Idempotent if the active event is redelivered (composite PK).
        .onConflictDoNothing();
    }
  }

  moduleLogger.info(
    { channelId: liveStream.channelId, context: { muxAssetId: assetId } },
    'Created live broadcast upload record',
  );
}

async function updateLiveStreamStatus(muxLiveStreamId: string, status: string) {
  await db
    .update(ChannelLiveStream)
    .set({ status, updatedAt: new Date() })
    .where(eq(ChannelLiveStream.muxLiveStreamId, muxLiveStreamId));
}

// Mark the broadcast's end time when the live stream goes idle, and return it
// (with channel slug) so the caller can schedule the fallback import. Prefer
// matching the exact broadcast by its Mux asset id (robust against a missed
// `idle` / overlapping broadcasts); fall back to the most recent not-yet-ended
// broadcast only when the event carries no asset id.
async function markBroadcastEnded(
  muxLiveStreamId: string,
  muxAssetId: string | null | undefined,
) {
  const liveStream = await db.query.ChannelLiveStream.findFirst({
    where: (t, { eq }) => eq(t.muxLiveStreamId, muxLiveStreamId),
  });
  if (!liveStream) return null;

  const broadcast = muxAssetId
    ? await db.query.UploadRecord.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.channelId, liveStream.channelId),
            eq(t.muxAssetId, muxAssetId),
            eq(t.isLiveBroadcast, true),
          ),
        with: { channel: { columns: { slug: true } } },
      })
    : await db.query.UploadRecord.findFirst({
        where: (t, { and, eq, isNull }) =>
          and(
            eq(t.channelId, liveStream.channelId),
            eq(t.isLiveBroadcast, true),
            isNull(t.liveEndedAt),
          ),
        orderBy: (t, { desc }) => desc(t.liveStartedAt),
        with: { channel: { columns: { slug: true } } },
      });
  if (!broadcast) return null;

  // Only stamp the end time once (idempotent across redeliveries).
  if (!broadcast.liveEndedAt) {
    await db
      .update(UploadRecord)
      .set({ liveEndedAt: new Date(), updatedAt: new Date() })
      .where(eq(UploadRecord.id, broadcast.id));
  }

  return broadcast;
}

// When the recording's static MP4 rendition is ready, import it into the
// broadcast's existing UploadRecord. Called for both the asset-level
// `static_renditions.ready` (asset id in data.id) and the per-rendition
// `static_rendition.ready` (asset id in data.asset_id). The matching
// broadcast record proves it's ours, so no live_stream_id check is needed.
// The workflow id is deterministic, so a duplicate delivery (e.g. both events
// firing) is deduplicated by Temporal.
async function handleRecordingReady(muxAssetId: string | null | undefined) {
  if (!muxAssetId) return;

  const broadcast = await db.query.UploadRecord.findFirst({
    where: (t, { eq }) => eq(t.muxAssetId, muxAssetId),
    with: { channel: true },
  });
  if (!broadcast || !broadcast.isLiveBroadcast) {
    moduleLogger.warn(
      { context: { muxAssetId } },
      'static rendition ready but no matching live broadcast record',
    );
    return;
  }
  // Already imported — nothing to do.
  if (broadcast.finalizedUploadKey) {
    return;
  }

  // Signal the (idle-started) import workflow that the MP4 is ready; starts it
  // if the idle event was missed. Idempotent via the deterministic workflow id.
  await signalMuxRenditionReady({
    uploadRecordId: broadcast.id,
    muxAssetId,
    channelSlug: broadcast.channel.slug,
    title: broadcast.title,
  });
  moduleLogger.info(
    { uploadId: broadcast.id, context: { muxAssetId } },
    'Signalled Mux recording ready',
  );
}

async function handleSimulcastTargetStatus(data: {
  id: string;
  status?: string | null;
}) {
  if (!data.status) return;
  await db
    .update(ChannelSimulcastTarget)
    .set({ status: data.status, updatedAt: new Date() })
    .where(eq(ChannelSimulcastTarget.muxSimulcastTargetId, data.id));
}

export const Route = createFileRoute('/webhooks_/mux')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: string;
        try {
          body = await readRequestBody(request, MUX_WEBHOOK_MAX_BODY_BYTES);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            return new Response('webhook rejected', { status: 413 });
          }
          return new Response('invalid body', { status: 400 });
        }
        const mux = getMux();
        const secret = getMuxWebhookSecret();
        let event: Awaited<ReturnType<typeof mux.webhooks.unwrap>>;

        if (secret) {
          try {
            event = await mux.webhooks.unwrap(body, request.headers, secret);
          } catch (err) {
            moduleLogger.warn(
              { err: err instanceof Error ? err : new Error(String(err)) },
              'Mux webhook signature verification failed',
            );
            return new Response('invalid signature', { status: 401 });
          }
        } else if (process.env.NODE_ENV === 'production') {
          // Never accept unsigned webhooks in production.
          moduleLogger.error(
            'MUX_WEBHOOK_SECRET is not set; refusing to process unverified webhook',
          );
          return new Response('webhook secret not configured', { status: 500 });
        } else {
          // Dev convenience: with no secret configured, skip verification so
          // synthetic webhook payloads (or a self-chosen-secret sender) can
          // drive the pipeline without Mux's generated secret.
          moduleLogger.warn(
            'MUX_WEBHOOK_SECRET not set; skipping signature verification (dev only)',
          );
          try {
            event = JSON.parse(body) as Awaited<
              ReturnType<typeof mux.webhooks.unwrap>
            >;
          } catch {
            return new Response('invalid body', { status: 400 });
          }
        }

        try {
          switch (event.type) {
            case 'video.live_stream.active':
              await handleLiveStreamActive(event.data as never);
              break;
            case 'video.live_stream.idle': {
              const data = event.data as {
                id: string;
                active_asset_id?: string | null;
                recent_asset_ids?: string[] | null;
              };
              const liveStreamId = data.id;
              // The just-ended broadcast's asset: active_asset_id, else the most
              // recent of recent_asset_ids (last entry).
              const endedAssetId =
                data.active_asset_id ?? data.recent_asset_ids?.at(-1) ?? null;
              const ended = await markBroadcastEnded(
                liveStreamId,
                endedAssetId,
              );
              await updateLiveStreamStatus(liveStreamId, 'idle');

              // Start the import workflow now; it waits for the rendition-ready
              // signal (with a 1-day fallback timer) before downloading. Tolerate
              // the case where the rendition-ready webhook already started it.
              if (ended?.muxAssetId && !ended.finalizedUploadKey) {
                try {
                  await startMuxImportRecording({
                    uploadRecordId: ended.id,
                    muxAssetId: ended.muxAssetId,
                    channelSlug: ended.channel.slug,
                    title: ended.title,
                  });
                } catch (err) {
                  if (
                    !(
                      err instanceof Error &&
                      err.name === 'WorkflowExecutionAlreadyStartedError'
                    )
                  ) {
                    throw err;
                  }
                }
              }
              break;
            }
            case 'video.live_stream.disconnected':
              await updateLiveStreamStatus(
                (event.data as { id: string }).id,
                'disconnected',
              );
              break;
            // Recording's downloadable MP4 is ready — the point at which the
            // import can actually fetch it. Mux fires both an asset-level event
            // (asset id in data.id) and a per-rendition event (asset id in
            // data.asset_id); handle both, deduped by Temporal workflow id.
            case 'video.asset.static_renditions.ready':
              await handleRecordingReady((event.data as { id: string }).id);
              break;
            case 'video.asset.static_rendition.ready':
              await handleRecordingReady(
                (event.data as { asset_id?: string }).asset_id,
              );
              break;
            case 'video.live_stream.simulcast_target.idle':
            case 'video.live_stream.simulcast_target.starting':
            case 'video.live_stream.simulcast_target.broadcasting':
            case 'video.live_stream.simulcast_target.errored':
              await handleSimulcastTargetStatus(event.data as never);
              break;
            default:
              // Unhandled event types are acknowledged so Mux stops retrying.
              break;
          }
        } catch (err) {
          moduleLogger.error(
            {
              err: err instanceof Error ? err : new Error(String(err)),
              context: { eventType: event.type },
            },
            'Error handling Mux webhook',
          );
          return new Response('error', { status: 500 });
        }

        return new Response('ok', { status: 200 });
      },
    },
  },
});
