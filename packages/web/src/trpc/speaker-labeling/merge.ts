// Merge one speaker into another: repoint every reference (attributions, links,
// tag requests) from the source onto the target, then permanently delete the
// source. Admin-only — this deliberately bypasses the per-channel link
// authorization that gates normal attribution writes, so a cross-channel merge
// is allowed.
import {
  db,
  Speaker,
  SpeakerAttribution,
  SpeakerLink,
  SpeakerTagRequest,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, eq, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { startIndexMediaDocument } from '@/temporal';

export async function mergeSpeakers({
  sourceId,
  targetId,
}: {
  sourceId: string;
  targetId: string;
}): Promise<{ uploads: number }> {
  if (sourceId === targetId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot merge a speaker into itself',
    });
  }

  const [source, target] = await Promise.all([
    db.query.Speaker.findFirst({
      columns: { id: true },
      where: (t, { and: a, eq: e, isNull }) =>
        a(e(t.id, sourceId), isNull(t.deletedAt)),
    }),
    db.query.Speaker.findFirst({
      columns: { id: true },
      where: (t, { and: a, eq: e, isNull }) =>
        a(e(t.id, targetId), isNull(t.deletedAt)),
    }),
  ]);
  if (!source) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Source speaker not found',
    });
  }
  if (!target) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Target speaker not found',
    });
  }

  // Uploads whose speaker rollup/voice vectors change: every upload the source is
  // attributed to. Captured before the repoint, re-indexed after — which also
  // drops the now-deleted source from search.
  const affected = await db
    .selectDistinct({ uploadRecordId: SpeakerAttribution.uploadRecordId })
    .from(SpeakerAttribution)
    .where(eq(SpeakerAttribution.speakerId, sourceId));

  const now = new Date();
  await db.transaction(async (tx) => {
    // For each referencing table, move the source's rows to the target EXCEPT
    // where the target already holds the conflicting unique row (the target
    // wins). The skipped source rows are left to cascade-delete with the speaker.

    // speaker_attribution — unique (upload_record_id, speaker_label).
    const exAttr = alias(SpeakerAttribution, 'ex_attr');
    await tx
      .update(SpeakerAttribution)
      .set({ speakerId: targetId, updatedAt: now })
      .where(
        and(
          eq(SpeakerAttribution.speakerId, sourceId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(exAttr)
              .where(
                and(
                  eq(exAttr.uploadRecordId, SpeakerAttribution.uploadRecordId),
                  eq(exAttr.speakerLabel, SpeakerAttribution.speakerLabel),
                  eq(exAttr.speakerId, targetId),
                ),
              ),
          ),
        ),
      );

    // speaker_link — unique (speaker_id, requesting_channel_id).
    const exLink = alias(SpeakerLink, 'ex_link');
    await tx
      .update(SpeakerLink)
      .set({ speakerId: targetId })
      .where(
        and(
          eq(SpeakerLink.speakerId, sourceId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(exLink)
              .where(
                and(
                  eq(exLink.speakerId, targetId),
                  eq(
                    exLink.requestingChannelId,
                    SpeakerLink.requestingChannelId,
                  ),
                ),
              ),
          ),
        ),
      );

    // speaker_tag_request — unique (speaker_id, upload_record_id, speaker_label).
    const exTag = alias(SpeakerTagRequest, 'ex_tag');
    await tx
      .update(SpeakerTagRequest)
      .set({ speakerId: targetId })
      .where(
        and(
          eq(SpeakerTagRequest.speakerId, sourceId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(exTag)
              .where(
                and(
                  eq(exTag.speakerId, targetId),
                  eq(exTag.uploadRecordId, SpeakerTagRequest.uploadRecordId),
                  eq(exTag.speakerLabel, SpeakerTagRequest.speakerLabel),
                ),
              ),
          ),
        ),
      );

    // Permanently delete the source. Rows still pointing at it (the conflicting
    // ones skipped above) cascade away via their ON DELETE CASCADE speaker FKs.
    await tx.delete(Speaker).where(eq(Speaker.id, sourceId));
  });

  await Promise.all(
    affected.map((u) => startIndexMediaDocument(u.uploadRecordId)),
  );

  return { uploads: affected.length };
}
