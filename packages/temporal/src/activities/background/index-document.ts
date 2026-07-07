import {
  Annotation,
  Channel,
  db,
  Organization,
  OrganizationAddress,
  OrganizationOrganizationAssociation,
  OrganizationTagInstance,
  Speaker,
  SpeakerAttribution,
  SpeakerParagraphLabel,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import {
  client,
  escapeDocument,
  SPEAKER_VECTOR_INDEX,
} from '@letschurch/opensearch';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import {
  bibleBookFromMetadata,
  bibleRefsFromMetadata,
} from '../../util/bible-refs';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/index-document',
});

export type DocumentKind = 'organization' | 'channel' | 'media';

async function getDocument(
  kind: DocumentKind,
  documentId: string,
  log: typeof logger,
) {
  switch (kind) {
    case 'organization': {
      log.info('Fetching metadata');
      const rec = await db
        .select({
          name: Organization.name,
          description: Organization.description,
          type: Organization.type,
        })
        .from(Organization)
        .where(eq(Organization.id, documentId))
        .then((r) => r[0]);

      invariant(rec, `Organization ${documentId} not found`);

      const addresses = await db
        .select()
        .from(OrganizationAddress)
        .where(
          and(
            eq(OrganizationAddress.organizationId, documentId),
            eq(OrganizationAddress.type, 'MEETING'),
          ),
        );

      const tags = await db
        .select({ tagSlug: OrganizationTagInstance.tagSlug })
        .from(OrganizationTagInstance)
        .where(eq(OrganizationTagInstance.organizationId, documentId));

      const upstreamOrganizationAssociations = await db
        .select({
          upstreamOrganizationId:
            OrganizationOrganizationAssociation.upstreamOrganizationId,
        })
        .from(OrganizationOrganizationAssociation)
        .where(
          and(
            eq(
              OrganizationOrganizationAssociation.downstreamOrganizationId,
              documentId,
            ),
            eq(OrganizationOrganizationAssociation.upstreamApproved, true),
            eq(OrganizationOrganizationAssociation.downstreamApproved, true),
          ),
        );

      const downstreamOrganizationAssociations = await db
        .select({
          downstreamOrganizationId:
            OrganizationOrganizationAssociation.downstreamOrganizationId,
        })
        .from(OrganizationOrganizationAssociation)
        .where(
          and(
            eq(
              OrganizationOrganizationAssociation.upstreamOrganizationId,
              documentId,
            ),
            eq(OrganizationOrganizationAssociation.upstreamApproved, true),
            eq(OrganizationOrganizationAssociation.downstreamApproved, true),
          ),
        );

      const loc = addresses[0];

      return {
        index: 'lc_organizations',
        id: documentId,
        document: {
          name: rec.name,
          description: rec.description,
          type: rec.type,
          tags: tags.map((tag) => tag.tagSlug),
          ...(loc?.latitude && loc?.longitude
            ? { meetingLocation: { lat: loc.latitude, lon: loc.longitude } }
            : {}),
          upstreamOrganizationAssociations:
            upstreamOrganizationAssociations.map(
              (assoc) => assoc.upstreamOrganizationId,
            ),
          downstreamOrganizationAssociations:
            downstreamOrganizationAssociations.map(
              (assoc) => assoc.downstreamOrganizationId,
            ),
        },
      };
    }
    case 'channel':
      log.info('Fetching metadata');
      return {
        index: 'lc_channels',
        id: documentId,
        document: await db
          .select({ name: Channel.name, visibility: Channel.visibility })
          .from(Channel)
          .where(eq(Channel.id, documentId))
          .then((r) => {
            invariant(r[0], `Channel ${documentId} not found`);
            return r[0];
          }),
      };
    case 'media': {
      log.info('Fetching upload + channel + paragraphs');
      const upRecRow = await db
        .select({
          channelId: UploadRecord.channelId,
          title: UploadRecord.title,
          description: UploadRecord.description,
          visibility: UploadRecord.visibility,
          publishedAt: UploadRecord.publishedAt,
          lengthSeconds: UploadRecord.lengthSeconds,
          transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
          transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
          summary: UploadRecord.summary,
          summaryEmbedding: UploadRecord.summaryEmbedding,
          searchSummaryEmbedding: UploadRecord.searchSummaryEmbedding,
        })
        .from(UploadRecord)
        .where(eq(UploadRecord.id, documentId))
        .then((r) => r[0]);

      invariant(upRecRow, `Upload record ${documentId} not found`);

      // Uploads that haven't yet been through the LLM post-processing pipeline
      // (legacy data, or a partial re-process) get skipped here. The caller
      // (`indexDocument`) treats a null return as a no-op so reindex jobs over
      // mixed populations don't error.
      if (!upRecRow.summaryEmbedding || !upRecRow.searchSummaryEmbedding) {
        log.warn('No summary embedding present; skipping lc_media_v1 write');
        return null;
      }

      const channelRow = await db
        .select({
          name: Channel.name,
          visibility: Channel.visibility,
          approvedAt: Channel.approvedAt,
        })
        .from(Channel)
        .where(eq(Channel.id, upRecRow.channelId))
        .then((r) => r[0]);

      invariant(
        channelRow,
        `Channel not found for upload record ${documentId}`,
      );

      const paragraphs = await db
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          start: TranscriptParagraph.start,
          end: TranscriptParagraph.end,
          speaker: TranscriptParagraph.speaker,
          speakerEmbedding: TranscriptParagraph.speakerEmbedding,
          text: TranscriptParagraph.text,
          embedding: TranscriptParagraph.embedding,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, documentId))
        .orderBy(asc(TranscriptParagraph.order));

      // Per-paragraph effective-label overrides (a user moved a paragraph to a
      // different/new label before attributing). Effective label for a
      // paragraph is this override if present, else its diarization speaker.
      const labelOverrides = await db
        .select({
          paragraphId: SpeakerParagraphLabel.paragraphId,
          label: SpeakerParagraphLabel.label,
        })
        .from(SpeakerParagraphLabel)
        .innerJoin(
          TranscriptParagraph,
          eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
        )
        .where(eq(TranscriptParagraph.uploadRecordId, documentId));
      const overrideByParagraphId = new Map(
        labelOverrides.map((o) => [o.paragraphId, o.label]),
      );

      // Speaker attributions for this upload: (effective label) → resolved
      // identity. Soft-deleted speakers are excluded so their names drop out of
      // search on the next re-index.
      const attributions = await db
        .select({
          speakerLabel: SpeakerAttribution.speakerLabel,
          speakerId: SpeakerAttribution.speakerId,
          speakerName: Speaker.name,
        })
        .from(SpeakerAttribution)
        .innerJoin(Speaker, eq(SpeakerAttribution.speakerId, Speaker.id))
        .where(
          and(
            eq(SpeakerAttribution.uploadRecordId, documentId),
            isNull(Speaker.deletedAt),
          ),
        );
      const speakerByLabel = new Map(
        attributions.map((a) => [
          a.speakerLabel,
          { speakerId: a.speakerId, speakerName: a.speakerName },
        ]),
      );
      const effectiveLabel = (p: (typeof paragraphs)[number]) =>
        overrideByParagraphId.get(p.id) ?? p.speaker;

      // Doc-level rollup of distinct resolved speaker names across the upload —
      // the speaker facet + filter source.
      const speakers = Array.from(
        new Set(
          paragraphs
            .map(
              (p) => speakerByLabel.get(effectiveLabel(p) ?? '')?.speakerName,
            )
            .filter((n): n is string => n != null),
        ),
      );

      // Flat speaker-vector docs (one per attributed effective label) for the
      // `lc_speaker_vectors` suggestion index: each label's mean titanet vector
      // tagged with its resolved speakerId. The activity syncs these for the
      // upload after indexing the media doc.
      const vecsByLabel = new Map<
        string,
        { speakerId: string; sum: number[]; n: number }
      >();
      for (const p of paragraphs) {
        const label = effectiveLabel(p);
        const resolved = label ? speakerByLabel.get(label) : undefined;
        const emb = p.speakerEmbedding;
        if (!label || !resolved || !Array.isArray(emb) || emb.length === 0) {
          continue;
        }
        const entry = vecsByLabel.get(label);
        if (entry) {
          for (let i = 0; i < emb.length; i++) entry.sum[i] += emb[i] ?? 0;
          entry.n += 1;
        } else {
          vecsByLabel.set(label, {
            speakerId: resolved.speakerId,
            sum: [...emb],
            n: 1,
          });
        }
      }
      const speakerVectors = Array.from(vecsByLabel.entries()).map(
        ([label, { speakerId, sum, n }]) => ({
          id: `${documentId}:${label}`,
          document: {
            speakerId,
            channelId: upRecRow.channelId,
            uploadRecordId: documentId,
            embedding: sum.map((v) => v / n),
          },
        }),
      );

      // Doc-level rollup of every Bible verse cited anywhere in this upload's
      // transcript (BIBLE annotations hang off paragraphs, so join through
      // them), expanded to per-verse OSIS keyword tokens. Powers the verse
      // facet + filter in search. De-duped across the whole transcript.
      const bibleAnnotations = await db
        .select({ metadata: Annotation.metadata })
        .from(Annotation)
        .innerJoin(
          TranscriptParagraph,
          eq(Annotation.paragraphId, TranscriptParagraph.id),
        )
        .where(
          and(
            eq(TranscriptParagraph.uploadRecordId, documentId),
            eq(Annotation.kind, 'BIBLE'),
          ),
        );
      const bibleRefs = Array.from(
        new Set(
          bibleAnnotations.flatMap((a) => bibleRefsFromMetadata(a.metadata)),
        ),
      );
      // Distinct OSIS books cited (covers book-/chapter-only refs that produce
      // no verse token) — the book facet + filter source.
      const bibleBooks = Array.from(
        new Set(
          bibleAnnotations
            .map((a) => bibleBookFromMetadata(a.metadata))
            .filter((b): b is string => b != null),
        ),
      );

      return {
        index: 'lc_media_v1',
        id: documentId,
        // Sibling to `document`: the activity syncs these into the flat
        // `lc_speaker_vectors` index (one per attributed label) after indexing.
        speakerVectors,
        document: escapeDocument({
          channelId: upRecRow.channelId,
          visibility: upRecRow.visibility,
          channelVisibility: channelRow.visibility,
          channelApprovedAt: channelRow.approvedAt?.toISOString() ?? null,
          publishedAt: upRecRow.publishedAt.toISOString(),
          lengthSeconds: upRecRow.lengthSeconds,
          transcodingFinishedAt:
            upRecRow.transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt:
            upRecRow.transcribingFinishedAt?.toISOString() ?? null,
          title: upRecRow.title,
          description: upRecRow.description,
          channelName: channelRow.name,
          summary: upRecRow.summary,
          // Distinct resolved speaker names across the upload (from
          // speaker_attribution) — the speaker facet + filter source. Empty
          // until the upload's labels are attributed.
          speakers,
          // Distinct Bible verses cited in the transcript (OSIS
          // `Book.Chapter.Verse` tokens) — the verse facet + filter source.
          bibleRefs,
          // Distinct OSIS books cited — the book facet + filter source.
          bibleBooks,
          summaryEmbedding: upRecRow.summaryEmbedding,
          searchSummaryEmbedding: upRecRow.searchSummaryEmbedding,
          paragraphs: paragraphs.map((p) => {
            const resolved = speakerByLabel.get(effectiveLabel(p) ?? '');
            return {
              order: p.order,
              start: p.start,
              end: p.end,
              speaker: p.speaker,
              speakerId: resolved?.speakerId ?? null,
              speakerName: resolved?.speakerName ?? null,
              // No speaker vector here: voice-match suggestions run off the flat
              // `lc_speaker_vectors` index instead, so storing 192-dim vectors
              // per paragraph would be pure bloat.
              text: p.text,
              embedding: p.embedding,
            };
          }),
        }),
      };
    }
    default: {
      const un: never = kind;
      throw new Error(`Unknown document kind: ${un}`);
    }
  }
}

export default async function indexDocument(
  kind: DocumentKind,
  uploadRecordId: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'indexDocument',
    context: {
      args: {
        uploadRecordId,
      },
      meta: JSON.stringify({ kind }),
    },
  });

  const doc = await getDocument(kind, uploadRecordId, activityLogger);

  if (doc === null) {
    // getDocument decided to skip this write (e.g. lc_media_v1 when the
    // upload hasn't been LLM-post-processed yet). Not an error.
    activityLogger.info('Skipped (no document to index)');
    return;
  }

  const indexRes = await client.index({
    index: doc.index,
    id: doc.id,
    body: doc.document,
  });

  invariant(
    ['created', 'updated'].includes(indexRes.body.result ?? ''),
    `Document not indexed`,
  );

  // Keep the flat speaker-vector index in sync with this upload's attributions:
  // wipe its existing docs, then re-add one mean vector per attributed label.
  // Isolated from the main media write — a sync hiccup shouldn't fail indexing.
  const speakerVectors = 'speakerVectors' in doc ? doc.speakerVectors : null;
  if (speakerVectors) {
    try {
      await client.deleteByQuery({
        index: SPEAKER_VECTOR_INDEX,
        refresh: true,
        body: { query: { term: { uploadRecordId } } },
      });
      if (speakerVectors.length > 0) {
        await client.bulk({
          refresh: true,
          body: speakerVectors.flatMap((sv) => [
            { index: { _index: SPEAKER_VECTOR_INDEX, _id: sv.id } },
            sv.document,
          ]),
        });
      }
    } catch (err) {
      activityLogger.warn(
        {
          context: { error: err instanceof Error ? err.message : String(err) },
        },
        'Failed to sync lc_speaker_vectors',
      );
    }
  }

  activityLogger.info('Done!');
}
