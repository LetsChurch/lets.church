import {
  Channel,
  db,
  Organization,
  OrganizationAddress,
  OrganizationOrganizationAssociation,
  OrganizationTagInstance,
  UploadRecord,
} from '@letschurch/db';
import { client, escapeDocument } from '@letschurch/elasticsearch';
import { publicS3 } from '@letschurch/s3/public';
import { and, eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import logger from '../../util/logger';
import { transcriptSegmentSchema } from '../../util/zod';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/index-document',
});

export type DocumentKind = 'transcript' | 'upload' | 'organization' | 'channel';

async function getDocument(
  kind: DocumentKind,
  documentId: string,
  log: typeof logger,
  s3UploadKey?: string,
) {
  switch (kind) {
    case 'transcript': {
      log.info('Fetching transcript');
      invariant(s3UploadKey, 'uploadKey is required for transcript');
      const res = await publicS3.getObject(s3UploadKey);
      const body = await res.Body?.transformToString('utf-8');
      invariant(body, `No object with key ${s3UploadKey} found`);
      const parsed = parseVtt(body)
        .filter((n): n is NodeCue => n.type === 'cue')
        .map(({ data: { start, end, text } }) => ({ start, end, text }));

      log.info('Fetching metadata');
      const upRecRow = await db
        .select({
          publishedAt: UploadRecord.publishedAt,
          visibility: UploadRecord.visibility,
          transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
          transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
          channelId: UploadRecord.channelId,
        })
        .from(UploadRecord)
        .where(eq(UploadRecord.id, documentId))
        .then((r) => r[0]);

      invariant(upRecRow, `Upload record ${documentId} not found`);

      const channelRow = await db
        .select({ visibility: Channel.visibility })
        .from(Channel)
        .where(eq(Channel.id, upRecRow.channelId))
        .then((r) => r[0]);

      invariant(
        channelRow,
        `Channel not found for upload record ${documentId}`,
      );

      const {
        publishedAt,
        transcodingFinishedAt,
        transcribingFinishedAt,
        ...upRec
      } = upRecRow;

      return {
        index: 'lc_transcripts',
        id: documentId,
        document: escapeDocument({
          ...upRec,
          segments: transcriptSegmentSchema.parse(parsed),
          publishedAt: publishedAt.toISOString(),
          transcodingFinishedAt: transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt: transcribingFinishedAt?.toISOString() ?? null,
          channelVisibility: channelRow.visibility,
        }),
      };
    }
    case 'upload': {
      log.info('Fetching metadata');
      const upRecRow = await db
        .select({
          channelId: UploadRecord.channelId,
          title: UploadRecord.title,
          description: UploadRecord.description,
          visibility: UploadRecord.visibility,
          publishedAt: UploadRecord.publishedAt,
          transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
          transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
        })
        .from(UploadRecord)
        .where(eq(UploadRecord.id, documentId))
        .then((r) => r[0]);

      invariant(upRecRow, `Upload record ${documentId} not found`);

      const channelRow = await db
        .select({ visibility: Channel.visibility })
        .from(Channel)
        .where(eq(Channel.id, upRecRow.channelId))
        .then((r) => r[0]);

      invariant(
        channelRow,
        `Channel not found for upload record ${documentId}`,
      );

      const {
        publishedAt,
        transcodingFinishedAt,
        transcribingFinishedAt,
        ...upRec
      } = upRecRow;

      return {
        index: 'lc_uploads_v2',
        id: documentId,
        document: escapeDocument({
          ...upRec,
          publishedAt: publishedAt.toISOString(),
          transcodingFinishedAt: transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt: transcribingFinishedAt?.toISOString() ?? null,
          channelVisibility: channelRow.visibility,
        }),
      };
    }
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
    default: {
      const un: never = kind;
      throw new Error(`Unknown document kind: ${un}`);
    }
  }
}

export default async function indexDocument(
  kind: DocumentKind,
  uploadRecordId: string,
  s3UploadKey?: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'indexDocument',
    context: {
      args: {
        uploadRecordId,
        s3UploadKey,
      },
      meta: JSON.stringify({ kind }),
    },
  });

  const doc = await getDocument(
    kind,
    uploadRecordId,
    activityLogger,
    s3UploadKey,
  );

  const indexRes = await client.index({
    index: doc.index,
    id: doc.id,
    document: doc.document,
  });

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  activityLogger.info('Done!');
}
