import invariant from 'tiny-invariant';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { getObject, S3_PUBLIC_BUCKET } from '../../../util/s3';
import { transcriptSegmentSchema } from '../../../util/zod';

export type DocumentKind = 'transcript' | 'upload' | 'organization' | 'channel';

async function getDocument(
  kind: DocumentKind,
  documentId: string,
  s3UploadKey?: string,
) {
  switch (kind) {
    case 'transcript':
      invariant(s3UploadKey, 'uploadKey is required for transcript');
      const res = await getObject(S3_PUBLIC_BUCKET, s3UploadKey);
      const body = await res.Body?.transformToString('utf-8');
      invariant(body, `No object with key ${s3UploadKey} found`);
      const parsed = parseVtt(body)
        .filter((n): n is NodeCue => n.type === 'cue')
        .map(({ data: { start, end, text } }) => ({ start, end, text }));

      const { publishedAt, ...upRec } =
        await prisma.uploadRecord.findUniqueOrThrow({
          where: { id: documentId },
          select: { channelId: true, publishedAt: true, visibility: true },
        });

      return {
        index: 'lc_transcripts',
        id: documentId,
        document: escapeDocument({
          ...upRec,
          segments: transcriptSegmentSchema.parse(parsed),
          publishedAt: publishedAt.toISOString(),
        }),
      };
    case 'upload':
      return {
        index: 'lc_uploads',
        id: documentId,
        document: await prisma.uploadRecord.findUniqueOrThrow({
          where: { id: documentId },
          select: {
            channelId: true,
            title: true,
            description: true,
            visibility: true,
            publishedAt: true,
            // TODO: tags
          },
        }),
      };
    case 'organization':
      return {
        index: 'lc_organizations',
        id: documentId,
        document: await prisma.organization.findUniqueOrThrow({
          where: { id: documentId },
          select: { name: true },
        }),
      };
    case 'channel':
      return {
        index: 'lc_channels',
        id: documentId,
        document: await prisma.channel.findUniqueOrThrow({
          where: { id: documentId },
          select: { name: true },
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
  const doc = await getDocument(kind, uploadRecordId, s3UploadKey);

  const indexRes = await client.index(doc);

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  console.log('Done!');
}
