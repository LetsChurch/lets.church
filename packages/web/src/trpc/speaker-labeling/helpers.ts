// Shared speaker-attribution authorization helpers. Extracted from the channel
// router so both it and the speaker-labeling queue (which writes attributions
// across uploads/channels) can reuse them without a circular import.
import { db, Speaker, SpeakerLink } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, eq, ilike, or } from 'drizzle-orm';

// Slugify a speaker name into a URL-safe base ("Conley Owens" → "conley-owens").
export function speakerSlugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'speaker';
}

// Pick a slug unique within the channel: `base`, else `base-2`, `base-3`, … The
// unique index spans all rows (incl. soft-deleted), so reserved slugs stay
// reserved — acceptable for v1.
export async function uniqueSpeakerSlug(
  channelId: string,
  base: string,
): Promise<string> {
  const existing = await db
    .select({ slug: Speaker.slug })
    .from(Speaker)
    .where(
      and(
        eq(Speaker.channelId, channelId),
        or(eq(Speaker.slug, base), ilike(Speaker.slug, `${base}-%`)),
      ),
    );
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// The channels whose speakers a given channel may attribute to: its own, plus
// any channel it holds an ACCEPTED speaker link into. Used to scope candidate
// suggestions to authorized identities.
export async function authorizedSpeakerChannelIds(
  channelId: string,
): Promise<string[]> {
  const linked = await db
    .selectDistinct({ channelId: Speaker.channelId })
    .from(SpeakerLink)
    .innerJoin(Speaker, eq(SpeakerLink.speakerId, Speaker.id))
    .where(
      and(
        eq(SpeakerLink.requestingChannelId, channelId),
        eq(SpeakerLink.status, 'ACCEPTED'),
      ),
    );
  return Array.from(new Set([channelId, ...linked.map((r) => r.channelId)]));
}

// Verify a speaker may be attributed to an upload by a channel: either the
// channel owns the (non-deleted) speaker, or it holds an ACCEPTED link whose
// grant covers this upload (channel-wide when grantedUploadId is null).
export async function assertSpeakerUsable(
  channelId: string,
  speakerId: string,
  uploadId: string,
): Promise<void> {
  const speaker = await db.query.Speaker.findFirst({
    columns: { id: true, channelId: true },
    where: (t, { and, eq, isNull }) =>
      and(eq(t.id, speakerId), isNull(t.deletedAt)),
  });
  if (!speaker) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Speaker not found' });
  }
  if (speaker.channelId === channelId) return;

  const link = await db.query.SpeakerLink.findFirst({
    columns: { grantedUploadId: true },
    where: (t, { and, eq }) =>
      and(
        eq(t.speakerId, speakerId),
        eq(t.requestingChannelId, channelId),
        eq(t.status, 'ACCEPTED'),
      ),
  });
  if (!link || (link.grantedUploadId && link.grantedUploadId !== uploadId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This channel is not authorized to use that speaker here',
    });
  }
}

// Confirm an upload belongs to the channel; throws NOT_FOUND otherwise.
export async function assertUploadInChannel(
  channelId: string,
  uploadId: string,
): Promise<void> {
  const upload = await db.query.UploadRecord.findFirst({
    columns: { id: true },
    where: (t, { and, eq }) =>
      and(eq(t.id, uploadId), eq(t.channelId, channelId)),
  });
  if (!upload) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
  }
}
