import invariant from 'tiny-invariant';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { AddressType } from '@prisma/client';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { getObject } from '../../../util/s3';
import { transcriptSegmentSchema } from '../../../util/zod';
import logger from '../../../util/logger';
import { stitchToHtml, whisperJsonSchema } from '../../../util/whisper';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/index-document',
});

export type DocumentKind =
  | 'transcript'
  | 'transcriptHtml'
  | 'upload'
  | 'organization'
  | 'channel';

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
      const res = await getObject('PUBLIC', s3UploadKey);
      const body = await res.Body?.transformToString('utf-8');
      invariant(body, `No object with key ${s3UploadKey} found`);
      const parsed = parseVtt(body)
        .filter((n): n is NodeCue => n.type === 'cue')
        .map(({ data: { start, end, text } }) => ({ start, end, text }));

      log.info('Fetching metadata');
      const {
        publishedAt,
        transcodingFinishedAt,
        transcribingFinishedAt,
        channel,
        ...upRec
      } = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: documentId },
        select: {
          publishedAt: true,
          visibility: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          channelId: true,
          channel: true,
        },
      });

      return {
        index: 'lc_transcripts',
        id: documentId,
        document: escapeDocument({
          ...upRec,
          segments: transcriptSegmentSchema.parse(parsed),
          publishedAt: publishedAt.toISOString(),
          transcodingFinishedAt: transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt: transcribingFinishedAt?.toISOString() ?? null,
          channelVisibility: channel.visibility,
        }),
      };
    }
    case 'transcriptHtml': {
      log.info('Fetching transcript');
      invariant(s3UploadKey, 'uploadKey is required for transcript');
      const res = await getObject('PUBLIC', s3UploadKey);
      const body = await res.Body?.transformToString('utf-8');
      invariant(body, `No object with key ${s3UploadKey} found`);
      const html = stitchToHtml(whisperJsonSchema.parse(JSON.parse(body)));

      log.info('Fetching metadata');
      const {
        publishedAt,
        transcodingFinishedAt,
        transcribingFinishedAt,
        channel,
        ...upRec
      } = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: documentId },
        select: {
          publishedAt: true,
          visibility: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          channelId: true,
          channel: true,
        },
      });

      return {
        index: 'lc_transcripts_v2',
        id: documentId,
        document: {
          ...upRec,
          html,
          publishedAt: publishedAt.toISOString(),
          transcodingFinishedAt: transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt: transcribingFinishedAt?.toISOString() ?? null,
          channelVisibility: channel.visibility,
        },
      };
    }
    case 'upload': {
      log.info('Fetching metadata');
      const {
        publishedAt,
        transcodingFinishedAt,
        transcribingFinishedAt,
        channel,
        ...upRec
      } = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: documentId },
        select: {
          channelId: true,
          title: true,
          description: true,
          visibility: true,
          publishedAt: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          channel: true,
          // TODO: tags
        },
      });
      return {
        index: 'lc_uploads_v2',
        id: documentId,
        document: escapeDocument({
          ...upRec,
          publishedAt: publishedAt.toISOString(),
          transcodingFinishedAt: transcodingFinishedAt?.toISOString() ?? null,
          transcribingFinishedAt: transcribingFinishedAt?.toISOString() ?? null,
          channelVisibility: channel.visibility,
        }),
      };
    }
    case 'organization':
      log.info('Fetching metadata');
      const rec = await prisma.organization.findUniqueOrThrow({
        where: { id: documentId },
        select: {
          name: true,
          description: true,
          addresses: { where: { type: AddressType.MEETING } },
          type: true,
          tags: true,
          upstreamOrganizationAssociations: {
            where: {
              upstreamApproved: true,
              downstreamApproved: true,
            },
          },
          downstreamOrganizationAssociations: {
            where: {
              upstreamApproved: true,
              downstreamApproved: true,
            },
          },
        },
      });

      const loc = rec.addresses[0];

      return {
        index: 'lc_organizations',
        id: documentId,
        document: {
          name: rec.name,
          description: rec.description,
          type: rec.type,
          tags: rec.tags.map((tag) => tag.tagSlug),
          ...(loc?.latitude && loc?.longitude
            ? { meetingLocation: { lat: loc.latitude, lon: loc.longitude } }
            : {}),
          upstreamOrganizationAssociations:
            rec.upstreamOrganizationAssociations.map(
              (assoc) => assoc.upstreamOrganizationId,
            ),
          downstreamOrganizationAssociations:
            rec.downstreamOrganizationAssociations.map(
              (assoc) => assoc.downstreamOrganizationId,
            ),
        },
      };
    case 'channel':
      log.info('Fetching metadata');
      return {
        index: 'lc_channels',
        id: documentId,
        document: await prisma.channel.findUniqueOrThrow({
          where: { id: documentId },
          select: { name: true, visibility: true },
        }),
      };
    default:
      const un: never = kind;
      throw new Error(`Unknown document kind: ${un}`);
  }
}

export default async function indexDocument(
  kind: DocumentKind,
  uploadRecordId: string,
  s3UploadKey?: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'indexDocument',
    args: {
      uploadRecordId,
      s3UploadKey,
    },
    meta: JSON.stringify({ kind }),
  });

  const doc = await getDocument(
    kind,
    uploadRecordId,
    activityLogger,
    s3UploadKey,
  );

  const indexRes = await client.index(doc);

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  activityLogger.info('Done!');
}
