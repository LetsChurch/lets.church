import { ChannelLiveStream, ChannelSimulcastTarget, db } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import {
  addSimulcastTargetSchema,
  removeSimulcastTargetSchema,
  setNextBroadcastSchema,
} from '@/schemas/dashboard/live-streaming';
import logger from '@/util/logger';
import { getMux, MUX_RTMP_URL, MUX_RTMPS_URL } from '@/util/mux';

import { router } from '../../trpc';
import { channelAdminProcedure } from './channels';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/live-streaming',
});

// Load a channel's live stream row (with simulcast targets) or null. Shared
// by every procedure below.
async function getChannelLiveStream(channelId: string) {
  return db.query.ChannelLiveStream.findFirst({
    where: (t, { eq }) => eq(t.channelId, channelId),
    with: { simulcastTargets: true },
  });
}

export const liveStreamingRouter = router({
  // Returns the channel's live stream config (ingest URL + key, playback id,
  // status, next-broadcast metadata, simulcast targets), or null if the
  // channel hasn't provisioned live streaming yet.
  getLiveStream: channelAdminProcedure.query(async ({ input }) => {
    const liveStream = await getChannelLiveStream(input.channelId);
    if (!liveStream) {
      return null;
    }

    // Stream key isn't stored — fetch it from Mux for display. Best-effort so
    // the rest of the panel (and the channel-page status tile) still render if
    // Mux is unreachable.
    let streamKey: string | null = null;
    try {
      const muxLiveStream = await getMux().video.liveStreams.retrieve(
        liveStream.muxLiveStreamId,
      );
      streamKey = muxLiveStream.stream_key ?? null;
    } catch (error) {
      moduleLogger.warn(
        {
          channelId: input.channelId,
          err: error instanceof Error ? error : new Error(String(error)),
        },
        'Failed to fetch Mux stream key',
      );
    }

    return {
      ...liveStream,
      streamKey,
      rtmpsUrl: MUX_RTMPS_URL,
      rtmpUrl: MUX_RTMP_URL,
    };
  }),

  // Idempotently provision a Mux live stream for the channel. Static
  // renditions are enabled in new_asset_settings so each broadcast's recording
  // exposes a downloadable MP4 we can later import.
  provisionLiveStream: channelAdminProcedure.mutation(
    async ({ ctx, input }) => {
      const existing = await getChannelLiveStream(input.channelId);
      if (existing) {
        return { ...existing, rtmpsUrl: MUX_RTMPS_URL, rtmpUrl: MUX_RTMP_URL };
      }

      const reconnectWindow = 60;
      const muxLiveStream = await getMux().video.liveStreams.create({
        latency_mode: 'standard',
        reconnect_window: reconnectWindow,
        playback_policy: ['public'],
        new_asset_settings: {
          playback_policies: ['public'],
          static_renditions: [{ resolution: 'highest' }],
        },
      });

      const playbackId = muxLiveStream.playback_ids?.[0]?.id ?? null;

      // onConflictDoNothing guards a concurrent double-provision (TOCTOU on the
      // existing-check above): the unique channel_id constraint means only one
      // insert wins. If we lost the race, return the row that did win.
      const [row] = await db
        .insert(ChannelLiveStream)
        .values({
          channelId: input.channelId,
          muxLiveStreamId: muxLiveStream.id,
          muxPlaybackId: playbackId,
          latencyMode: 'standard',
          reconnectWindow,
          status: muxLiveStream.status ?? 'idle',
          createdById: ctx.session.appUserId,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (!row) {
        const winner = await getChannelLiveStream(input.channelId);
        if (winner) {
          return { ...winner, rtmpsUrl: MUX_RTMPS_URL, rtmpUrl: MUX_RTMP_URL };
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to provision live stream',
        });
      }

      moduleLogger.info(
        {
          channelId: input.channelId,
          context: { muxLiveStreamId: muxLiveStream.id },
        },
        'Provisioned Mux live stream',
      );

      return {
        ...row,
        streamKey: muxLiveStream.stream_key ?? null,
        simulcastTargets: [],
        rtmpsUrl: MUX_RTMPS_URL,
        rtmpUrl: MUX_RTMP_URL,
      };
    },
  ),

  // Rotate the stream key (e.g. if it leaked). The live stream id and playback
  // id are unchanged.
  resetStreamKey: channelAdminProcedure.mutation(async ({ input }) => {
    const liveStream = await getChannelLiveStream(input.channelId);
    if (!liveStream) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const updated = await getMux().video.liveStreams.resetStreamKey(
      liveStream.muxLiveStreamId,
    );

    // Nothing to persist — the key lives in Mux and is fetched on read.
    return { streamKey: updated.stream_key ?? '' };
  }),

  // Store the metadata applied to the UploadRecord created the next time the
  // stream goes active (see the webhook handler).
  setNextBroadcast: channelAdminProcedure
    .input(setNextBroadcastSchema)
    .mutation(async ({ input }) => {
      const liveStream = await getChannelLiveStream(input.channelId);
      if (!liveStream) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await db
        .update(ChannelLiveStream)
        .set({
          nextTitle: input.title,
          nextDescription: input.description,
          nextVisibility: input.visibility,
          nextLicense: input.license,
          nextCommentsEnabled: input.commentsEnabled,
          nextDownloadsEnabled: input.downloadsEnabled,
          nextSeriesId: input.seriesId,
          updatedAt: new Date(),
        })
        .where(eq(ChannelLiveStream.id, liveStream.id));

      return { success: true };
    }),

  // Add a simulcast (restream) target. Mux requires the parent live stream to
  // be idle when creating targets.
  addSimulcastTarget: channelAdminProcedure
    .input(addSimulcastTargetSchema)
    .mutation(async ({ input }) => {
      const liveStream = await getChannelLiveStream(input.channelId);
      if (!liveStream) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const target = await getMux().video.liveStreams.createSimulcastTarget(
        liveStream.muxLiveStreamId,
        {
          url: input.url,
          stream_key: input.streamKey,
          passthrough: input.label,
        },
      );

      const [row] = await db
        .insert(ChannelSimulcastTarget)
        .values({
          channelLiveStreamId: liveStream.id,
          muxSimulcastTargetId: target.id,
          label: input.label,
          url: input.url,
          status: target.status ?? 'idle',
          updatedAt: new Date(),
        })
        .returning();

      return row;
    }),

  // Remove a simulcast target. Mux requires the parent live stream to be idle.
  removeSimulcastTarget: channelAdminProcedure
    .input(removeSimulcastTargetSchema)
    .mutation(async ({ input }) => {
      const liveStream = await getChannelLiveStream(input.channelId);
      if (!liveStream) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const target = await db.query.ChannelSimulcastTarget.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.id, input.targetId),
            eq(t.channelLiveStreamId, liveStream.id),
          ),
      });
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await getMux().video.liveStreams.deleteSimulcastTarget(
        liveStream.muxLiveStreamId,
        target.muxSimulcastTargetId,
      );

      await db
        .delete(ChannelSimulcastTarget)
        .where(
          and(
            eq(ChannelSimulcastTarget.id, target.id),
            eq(ChannelSimulcastTarget.channelLiveStreamId, liveStream.id),
          ),
        );

      return { success: true };
    }),
});
