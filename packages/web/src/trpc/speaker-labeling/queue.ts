// Speaker labeling data: from the unlabeled diarized segments — (upload,
// effective-label) pairs with no speaker_attribution — produce TWO views:
//   • queue:    segments that voice-match an EXISTING named speaker (kNN over
//               lc_speaker_vectors), for one-click attribution.
//   • clusters: the leftover UNMATCHED segments grouped by mutual voice
//               similarity within a channel, so a recurring UNKNOWN voice can be
//               named once and mass-attributed.
// Both are computed from one scan: each segment's voice is the average of its
// paragraphs' 192-dim titanet `speakerEmbedding`.
import {
  Channel,
  db,
  Speaker,
  SpeakerAttribution,
  SpeakerParagraphLabel,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { suggestSpeakersByEmbedding } from '@letschurch/opensearch';
import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';

import { startIndexMediaDocument } from '@/temporal';

import {
  assertSpeakerUsable,
  authorizedSpeakerChannelIds,
  speakerSlugify,
  uniqueSpeakerSlug,
} from './helpers';

// Cap concurrent kNN round-trips when scanning many labels.
const KNN_CONCURRENCY = 8;
// Candidates returned per segment (1 top match + a few alternatives).
const CANDIDATES_PER_SEGMENT = 6;
const MAX_ALTERNATIVES = 4;
const SAMPLE_TEXT_MAX = 240;
// Cosine floor for grouping two unmatched voices together, and the max groups
// surfaced. A single unmatched voice is still surfaced (a 1-member group) so a
// one-off unknown speaker can be named too — groups just merge recurring ones.
const CLUSTER_THRESHOLD_DEFAULT = 0.8;
const CLUSTER_LIMIT = 100;

export type SpeakerMatch = {
  speakerId: string;
  name: string;
  channelId: string;
  channelName: string;
  matchPercent: number;
};

export type LabelingQueueItem = {
  uploadId: string;
  uploadTitle: string | null;
  channelId: string;
  channelName: string;
  speakerLabel: string;
  sampleText: string;
  startSeconds: number;
  paragraphCount: number;
  topMatch: SpeakerMatch;
  alternatives: SpeakerMatch[];
};

export type ClusterMember = {
  uploadId: string;
  uploadTitle: string | null;
  speakerLabel: string;
  sampleText: string;
  startSeconds: number;
  paragraphCount: number;
};

export type SpeakerCluster = {
  channelId: string;
  channelName: string;
  // Tightness of the group (min pairwise cosine, 0–100). Higher = more sure
  // every member is the same voice.
  cohesionPercent: number;
  members: ClusterMember[];
};

export type LabelingData = {
  queue: LabelingQueueItem[];
  clusters: SpeakerCluster[];
  // Pagination over the underlying unlabeled (upload, label) segments. `total` is
  // the full count for the channel(s); `queue` + `clusters` are derived from the
  // current page only (one page = up to `limit` segments scanned).
  total: number;
  hasMore: boolean;
};

// An untagged segment on ANOTHER channel whose voice matches one of a channel's
// own speakers — "your speaker probably speaks here but isn't tagged".
export type SpeakerAppearance = {
  speakerId: string;
  speakerName: string;
  uploadId: string;
  uploadTitle: string | null;
  // The OTHER (content) channel the appearance is on.
  channelId: string;
  channelName: string;
  speakerLabel: string;
  matchPercent: number;
  sampleText: string;
  startSeconds: number;
};

export type SpeakerAssignment = {
  uploadId: string;
  speakerLabel: string;
  speakerId: string;
};

// faiss cosinesimil knn returns score = (1 + cosine) / 2, so cosine = 2*score-1;
// surface as a 0–100 confidence (matches the dashboard modal's formula).
export function matchPercentFromScore(topScore: number): number {
  return Math.max(0, Math.min(100, Math.round((2 * topScore - 1) * 100)));
}

// Element-wise mean of equal-length vectors; null when there are none.
export function averageVectors(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dims = vectors[0]?.length ?? 0;
  if (dims === 0) return null;
  const avg = new Array<number>(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) avg[i] += (v[i] ?? 0) / vectors.length;
  }
  return avg;
}

function normalizeVector(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

// Cosine similarity of two already-L2-normalized vectors (their dot product).
function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

// Run `fn` over `items` at most `concurrency` at a time, preserving order.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const results = await Promise.all(slice.map(fn));
    for (let j = 0; j < results.length; j++) out[i + j] = results[j] as R;
  }
  return out;
}

type Segment = {
  uploadId: string;
  channelId: string;
  channelName: string;
  uploadTitle: string | null;
  speakerLabel: string;
  avgVector: number[] | null;
  paragraphCount: number;
  sampleText: string;
  startSeconds: number;
};

// Effective speaker label per paragraph: the user's per-paragraph override if
// any, else the diarization speaker. Shared across the unlabeled-segment queries.
const effectiveLabelSql = sql<string>`coalesce(${SpeakerParagraphLabel.label}, ${TranscriptParagraph.speaker})`;

type UnlabeledKey = {
  uploadId: string;
  speakerLabel: string;
  paragraphCount: number;
};

// The "unlabeled (upload, effective-label) segment" selection for a set of
// channels: paragraphs whose effective label has NO speaker_attribution, on
// transcribed, non-deleted uploads in those channels, grouped by (upload, label).
// No embeddings — cheap enough to count + paginate before touching the 192-dim
// vectors.
function unlabeledSegmentsBase(owningChannelIds: string[]) {
  return db
    .select({
      uploadId: TranscriptParagraph.uploadRecordId,
      speakerLabel: effectiveLabelSql,
      paragraphCount: sql<number>`count(*)::int`,
    })
    .from(TranscriptParagraph)
    .innerJoin(
      UploadRecord,
      eq(UploadRecord.id, TranscriptParagraph.uploadRecordId),
    )
    .leftJoin(
      SpeakerParagraphLabel,
      eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
    )
    .leftJoin(
      SpeakerAttribution,
      and(
        eq(
          SpeakerAttribution.uploadRecordId,
          TranscriptParagraph.uploadRecordId,
        ),
        eq(SpeakerAttribution.speakerLabel, effectiveLabelSql),
      ),
    )
    .where(
      and(
        inArray(UploadRecord.channelId, owningChannelIds),
        isNotNull(UploadRecord.transcribingFinishedAt),
        isNull(UploadRecord.deletedAt),
        isNull(SpeakerAttribution.speakerId),
        isNotNull(effectiveLabelSql),
      ),
    )
    .groupBy(TranscriptParagraph.uploadRecordId, effectiveLabelSql);
}

// One page of unlabeled segment keys, most-spoken voices first. No embeddings.
async function unlabeledSegmentKeys(
  owningChannelIds: string[],
  limit: number,
  offset: number,
): Promise<UnlabeledKey[]> {
  if (owningChannelIds.length === 0) return [];
  const rows = await unlabeledSegmentsBase(owningChannelIds)
    .orderBy(desc(sql`count(*)`), asc(TranscriptParagraph.uploadRecordId))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    uploadId: r.uploadId,
    speakerLabel: r.speakerLabel,
    paragraphCount: Number(r.paragraphCount),
  }));
}

// Total distinct unlabeled segments for the channel(s) — the pagination total.
export async function countUnlabeledSegments(
  owningChannelIds: string[],
): Promise<number> {
  if (owningChannelIds.length === 0) return 0;
  const sub = unlabeledSegmentsBase(owningChannelIds).as('unlabeled');
  const r = await db.select({ count: sql<string>`count(*)` }).from(sub);
  return Number(r[0]?.count ?? 0);
}

// Build ONE PAGE of unlabeled (upload, effective-label) segments with averaged
// voice vectors + previews. Bounded: a cheap key enumeration (above) is paginated
// first, then embeddings are loaded only for that page's uploads — so the cost is
// O(page), not O(channel). The shared input to the existing-speaker match
// (queue), the mutual-similarity clustering, and the cross-channel appearance
// search.
export async function collectUnlabeledSegments(
  owningChannelIds: string[],
  { limit, offset }: { limit: number; offset: number },
): Promise<Segment[]> {
  if (owningChannelIds.length === 0) return [];

  const keys = await unlabeledSegmentKeys(owningChannelIds, limit, offset);
  if (keys.length === 0) return [];
  const keySet = new Set(keys.map((k) => `${k.uploadId}::${k.speakerLabel}`));
  const uploadIds = [...new Set(keys.map((k) => k.uploadId))];

  const uploads = await db
    .select({
      id: UploadRecord.id,
      title: UploadRecord.title,
      channelId: UploadRecord.channelId,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(inArray(UploadRecord.id, uploadIds));
  const uploadById = new Map(uploads.map((u) => [u.id, u]));

  const paras = await db
    .select({
      uploadRecordId: TranscriptParagraph.uploadRecordId,
      start: TranscriptParagraph.start,
      text: TranscriptParagraph.text,
      speakerEmbedding: TranscriptParagraph.speakerEmbedding,
      effectiveLabel: sql<
        string | null
      >`coalesce(${SpeakerParagraphLabel.label}, ${TranscriptParagraph.speaker})`,
      attributedSpeakerId: SpeakerAttribution.speakerId,
    })
    .from(TranscriptParagraph)
    .leftJoin(
      SpeakerParagraphLabel,
      eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
    )
    .leftJoin(
      SpeakerAttribution,
      and(
        eq(
          SpeakerAttribution.uploadRecordId,
          TranscriptParagraph.uploadRecordId,
        ),
        eq(
          SpeakerAttribution.speakerLabel,
          sql`coalesce(${SpeakerParagraphLabel.label}, ${TranscriptParagraph.speaker})`,
        ),
      ),
    )
    .where(inArray(TranscriptParagraph.uploadRecordId, uploadIds))
    .orderBy(TranscriptParagraph.uploadRecordId, TranscriptParagraph.order);

  type Acc = {
    uploadId: string;
    channelId: string;
    speakerLabel: string;
    embeddings: number[][];
    paragraphCount: number;
    sampleText: string;
    startSeconds: number;
  };
  const groups = new Map<string, Acc>();
  for (const p of paras) {
    if (p.attributedSpeakerId) continue; // label already labeled
    const label = p.effectiveLabel;
    if (!label) continue;
    const upload = uploadById.get(p.uploadRecordId);
    if (!upload) continue;
    const key = `${p.uploadRecordId}::${label}`;
    if (!keySet.has(key)) continue; // only the segments in this page
    let g = groups.get(key);
    if (!g) {
      g = {
        uploadId: p.uploadRecordId,
        channelId: upload.channelId,
        speakerLabel: label,
        embeddings: [],
        paragraphCount: 0,
        sampleText: '',
        startSeconds: Math.round(p.start),
      };
      groups.set(key, g);
    }
    g.paragraphCount += 1;
    if (p.start < g.startSeconds) g.startSeconds = Math.round(p.start);
    if (Array.isArray(p.speakerEmbedding) && p.speakerEmbedding.length > 0) {
      g.embeddings.push(p.speakerEmbedding);
    }
    if (!g.sampleText && p.text.trim().length > 40) {
      g.sampleText = p.text.trim().slice(0, SAMPLE_TEXT_MAX);
    }
  }

  return [...groups.values()].map((g) => {
    const upload = uploadById.get(g.uploadId);
    let sampleText = g.sampleText;
    if (!sampleText) {
      const first = paras.find(
        (p) =>
          p.uploadRecordId === g.uploadId &&
          p.effectiveLabel === g.speakerLabel,
      );
      sampleText = (first?.text ?? '').trim().slice(0, SAMPLE_TEXT_MAX);
    }
    return {
      uploadId: g.uploadId,
      channelId: g.channelId,
      channelName: upload?.channelName ?? '',
      uploadTitle: upload?.title ?? null,
      speakerLabel: g.speakerLabel,
      avgVector: averageVectors(g.embeddings),
      paragraphCount: g.paragraphCount,
      sampleText,
      startSeconds: g.startSeconds,
    };
  });
}

// Single-linkage grouping of unmatched segments WITHIN each channel: connect two
// segments whose voices are cosine ≥ threshold. Every component is returned,
// including 1-member ones (a one-off unknown voice you can still name).
function clusterUnmatched(
  segments: Segment[],
  threshold: number,
): SpeakerCluster[] {
  const byChannel = new Map<string, Segment[]>();
  for (const s of segments) {
    if (!s.avgVector) continue;
    const list = byChannel.get(s.channelId);
    if (list) list.push(s);
    else byChannel.set(s.channelId, [s]);
  }

  const clusters: SpeakerCluster[] = [];
  for (const segs of byChannel.values()) {
    const n = segs.length;
    if (n === 0) continue;
    const norms = segs.map((s) => normalizeVector(s.avgVector ?? []));

    // Union-Find over pairs above threshold.
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r] as number;
      let c = x;
      while (parent[c] !== r) {
        const next = parent[c] as number;
        parent[c] = r;
        c = next;
      }
      return r;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (cosine(norms[i] ?? [], norms[j] ?? []) >= threshold) union(i, j);
      }
    }

    const components = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const list = components.get(root);
      if (list) list.push(i);
      else components.set(root, [i]);
    }

    for (const idxs of components.values()) {
      // Cohesion = the weakest pairwise link (1 for a lone segment).
      let minCos = 1;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const c = cosine(
            norms[idxs[a] as number] ?? [],
            norms[idxs[b] as number] ?? [],
          );
          if (c < minCos) minCos = c;
        }
      }
      const first = segs[idxs[0] as number] as Segment;
      clusters.push({
        channelId: first.channelId,
        channelName: first.channelName,
        cohesionPercent: Math.max(0, Math.min(100, Math.round(minCos * 100))),
        members: idxs.map((i) => {
          const s = segs[i] as Segment;
          return {
            uploadId: s.uploadId,
            uploadTitle: s.uploadTitle,
            speakerLabel: s.speakerLabel,
            sampleText: s.sampleText,
            startSeconds: s.startSeconds,
            paragraphCount: s.paragraphCount,
          };
        }),
      });
    }
  }

  // Biggest, then tightest, first.
  clusters.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      b.cohesionPercent - a.cohesionPercent,
  );
  return clusters.slice(0, CLUSTER_LIMIT);
}

export type BuildLabelingDataArgs = {
  /** Channels whose uploads to scan for unlabeled segments. */
  owningChannelIds: string[];
  minMatchPercent?: number;
  clusterThreshold?: number;
  /** Page size: max unlabeled segments to SCAN (kNN + cluster) per call. */
  limit?: number;
  /** Page offset into the most-spoken-first ordering of unlabeled segments. */
  offset?: number;
};

// The work is bounded to ONE PAGE of unlabeled segments (collectUnlabeledSegments
// paginates the cheap key enumeration, then loads embeddings + kNN + clusters only
// for that page), so a channel with tens of thousands of unlabeled voices no
// longer scans them all in a single request. `total`/`hasMore` drive UI paging.
export async function buildLabelingData({
  owningChannelIds,
  minMatchPercent = 70,
  clusterThreshold = CLUSTER_THRESHOLD_DEFAULT,
  limit = 200,
  offset = 0,
}: BuildLabelingDataArgs): Promise<LabelingData> {
  if (owningChannelIds.length === 0)
    return { queue: [], clusters: [], total: 0, hasMore: false };

  const [segments, total] = await Promise.all([
    collectUnlabeledSegments(owningChannelIds, { limit, offset }),
    countUnlabeledSegments(owningChannelIds),
  ]);
  const hasMore = offset + segments.length < total;
  const candidates = segments.filter(
    (s) => s.avgVector && s.avgVector.length > 0,
  );
  if (candidates.length === 0)
    return { queue: [], clusters: [], total, hasMore };

  // Authorized speaker pool per owning channel (own + ACCEPTED links).
  const authorizedByChannel = new Map<string, string[]>();
  await Promise.all(
    owningChannelIds.map(async (cid) => {
      authorizedByChannel.set(cid, await authorizedSpeakerChannelIds(cid));
    }),
  );

  // Existing-speaker kNN per segment (bounded concurrency).
  const knnBySegment = await mapWithConcurrency(
    candidates,
    KNN_CONCURRENCY,
    async (s) =>
      suggestSpeakersByEmbedding({
        speakerEmbedding: s.avgVector as number[],
        channelIds: authorizedByChannel.get(s.channelId) ?? [s.channelId],
        size: CANDIDATES_PER_SEGMENT,
        minMatchPercent,
      }),
  );

  // Batch-hydrate every candidate speaker's name + owning channel.
  const allIds = [
    ...new Set(knnBySegment.flatMap((cs) => cs.map((c) => c.speakerId))),
  ];
  const speakerById = new Map<
    string,
    { name: string; channelId: string; channelName: string }
  >();
  if (allIds.length > 0) {
    const speakers = await db
      .select({
        id: Speaker.id,
        name: Speaker.name,
        channelId: Speaker.channelId,
        channelName: Channel.name,
      })
      .from(Speaker)
      .innerJoin(Channel, eq(Speaker.channelId, Channel.id))
      .where(and(inArray(Speaker.id, allIds), isNull(Speaker.deletedAt)));
    for (const s of speakers) {
      speakerById.set(s.id, {
        name: s.name,
        channelId: s.channelId,
        channelName: s.channelName,
      });
    }
  }

  // Split: a segment with ≥1 resolving match → queue; otherwise → cluster pool.
  const queue: LabelingQueueItem[] = [];
  const unmatched: Segment[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const seg = candidates[i] as Segment;
    const matches: SpeakerMatch[] = [];
    for (const c of knnBySegment[i] ?? []) {
      const s = speakerById.get(c.speakerId);
      if (!s) continue;
      matches.push({
        speakerId: c.speakerId,
        name: s.name,
        channelId: s.channelId,
        channelName: s.channelName,
        matchPercent: matchPercentFromScore(c.topScore),
      });
    }
    const [topMatch, ...rest] = matches;
    if (!topMatch) {
      unmatched.push(seg);
      continue;
    }
    queue.push({
      uploadId: seg.uploadId,
      uploadTitle: seg.uploadTitle,
      channelId: seg.channelId,
      channelName: seg.channelName,
      speakerLabel: seg.speakerLabel,
      sampleText: seg.sampleText,
      startSeconds: seg.startSeconds,
      paragraphCount: seg.paragraphCount,
      topMatch,
      alternatives: rest.slice(0, MAX_ALTERNATIVES),
    });
  }

  queue.sort((a, b) => b.topMatch.matchPercent - a.topMatch.matchPercent);
  return {
    // The page already bounds the work; `queue` is the matched subset of the page.
    queue,
    clusters: clusterUnmatched(unmatched, clusterThreshold),
    total,
    hasMore,
  };
}

// Find untagged segments on OTHER channels that voice-match one of `channelId`'s
// own speakers — a hit means "your speaker appears here but isn't tagged". The
// scan over other channels' unlabeled segments is bounded to ONE PAGE (same
// mechanism as buildLabelingData), so this no longer scans every other channel's
// segments in a single request; `total`/`hasMore` page through them.
export async function buildSpeakerAppearances({
  channelId,
  minMatchPercent = 80,
  limit = 200,
  offset = 0,
}: {
  channelId: string;
  minMatchPercent?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  appearances: SpeakerAppearance[];
  total: number;
  hasMore: boolean;
}> {
  const contentChannelRows = await db
    .selectDistinct({ channelId: UploadRecord.channelId })
    .from(UploadRecord)
    .where(
      and(
        isNotNull(UploadRecord.transcribingFinishedAt),
        isNull(UploadRecord.deletedAt),
      ),
    );
  // Other channels only (exclude mine) — those are where my speakers could be
  // untagged. Scan + count are over that set so paging is over real candidates.
  const otherChannelIds = contentChannelRows
    .map((c) => c.channelId)
    .filter((cid) => cid !== channelId);
  if (otherChannelIds.length === 0) {
    return { appearances: [], total: 0, hasMore: false };
  }
  const [pageSegments, total] = await Promise.all([
    collectUnlabeledSegments(otherChannelIds, { limit, offset }),
    countUnlabeledSegments(otherChannelIds),
  ]);
  const hasMore = offset + pageSegments.length < total;
  const segments = pageSegments.filter((s) => s.avgVector);
  if (segments.length === 0) {
    return { appearances: [], total, hasMore };
  }

  // kNN each other-channel segment against ONLY my channel's speakers.
  const knn = await mapWithConcurrency(segments, KNN_CONCURRENCY, async (s) =>
    suggestSpeakersByEmbedding({
      speakerEmbedding: s.avgVector as number[],
      channelIds: [channelId],
      size: 1,
      minMatchPercent,
    }),
  );

  const ids = [...new Set(knn.flatMap((cs) => cs.map((c) => c.speakerId)))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const speakers = await db
      .select({ id: Speaker.id, name: Speaker.name })
      .from(Speaker)
      .where(and(inArray(Speaker.id, ids), isNull(Speaker.deletedAt)));
    for (const s of speakers) nameById.set(s.id, s.name);
  }

  const items: SpeakerAppearance[] = [];
  for (let i = 0; i < segments.length; i++) {
    const top = knn[i]?.[0];
    if (!top) continue;
    const name = nameById.get(top.speakerId);
    if (!name) continue;
    const s = segments[i] as Segment;
    items.push({
      speakerId: top.speakerId,
      speakerName: name,
      uploadId: s.uploadId,
      uploadTitle: s.uploadTitle,
      channelId: s.channelId,
      channelName: s.channelName,
      speakerLabel: s.speakerLabel,
      matchPercent: matchPercentFromScore(top.topScore),
      sampleText: s.sampleText,
      startSeconds: s.startSeconds,
    });
  }
  items.sort((a, b) => b.matchPercent - a.matchPercent);
  // The page already bounds the work, so no extra slice.
  return { appearances: items, total, hasMore };
}

// Apply a batch of (upload, label) → speaker attributions, authorizing each
// against its upload's channel, then reindex every touched upload once.
export async function applySpeakerAssignments(
  assignments: SpeakerAssignment[],
  opts: {
    actingUserId: string;
    authorizeChannel: (channelId: string) => boolean | Promise<boolean>;
  },
): Promise<{ assigned: number; uploads: number }> {
  if (assignments.length === 0) return { assigned: 0, uploads: 0 };

  const uploadIds = [...new Set(assignments.map((a) => a.uploadId))];
  const uploads = await db
    .select({ id: UploadRecord.id, channelId: UploadRecord.channelId })
    .from(UploadRecord)
    .where(inArray(UploadRecord.id, uploadIds));
  const channelByUpload = new Map(uploads.map((u) => [u.id, u.channelId]));

  // Authorize every assignment up front so a bad one fails the whole batch.
  for (const a of assignments) {
    const channelId = channelByUpload.get(a.uploadId);
    if (!channelId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
    }
    if (!(await opts.authorizeChannel(channelId))) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    await assertSpeakerUsable(channelId, a.speakerId, a.uploadId);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const a of assignments) {
      await tx
        .insert(SpeakerAttribution)
        .values({
          uploadRecordId: a.uploadId,
          speakerLabel: a.speakerLabel,
          speakerId: a.speakerId,
          createdById: opts.actingUserId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            SpeakerAttribution.uploadRecordId,
            SpeakerAttribution.speakerLabel,
          ],
          set: { speakerId: a.speakerId, updatedAt: now },
        });
    }
  });

  await Promise.all(uploadIds.map((id) => startIndexMediaDocument(id)));

  return { assigned: assignments.length, uploads: uploadIds.length };
}

// Create a new named speaker in `channelId` and attribute a cluster's members to
// it in one shot (the "mass-mark a recurring unknown voice" action). Every
// member upload must be authorized by `authorizeChannel`.
export async function createSpeakerAndAssign({
  channelId,
  name,
  members,
  actingUserId,
  authorizeChannel,
}: {
  channelId: string;
  name: string;
  members: Array<{ uploadId: string; speakerLabel: string }>;
  actingUserId: string;
  authorizeChannel: (channelId: string) => boolean | Promise<boolean>;
}): Promise<{ speakerId: string; assigned: number; uploads: number }> {
  if (!(await authorizeChannel(channelId))) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  if (members.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Select at least one segment',
    });
  }

  const slug = await uniqueSpeakerSlug(channelId, speakerSlugify(name));
  const [speaker] = await db
    .insert(Speaker)
    .values({
      channelId,
      name,
      slug,
      createdById: actingUserId,
      updatedAt: new Date(),
    })
    .returning({ id: Speaker.id });
  if (!speaker) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  }

  // If the assignment fails (member authorization, assertSpeakerUsable, …),
  // remove the speaker we just created so it isn't left orphaned. The
  // speaker_attribution FK cascades, so this also unwinds any rows that did land.
  let res: { assigned: number; uploads: number };
  try {
    res = await applySpeakerAssignments(
      members.map((m) => ({
        uploadId: m.uploadId,
        speakerLabel: m.speakerLabel,
        speakerId: speaker.id,
      })),
      { actingUserId, authorizeChannel },
    );
  } catch (err) {
    await db
      .delete(Speaker)
      .where(eq(Speaker.id, speaker.id))
      .catch(() => {});
    throw err;
  }
  return { speakerId: speaker.id, ...res };
}
