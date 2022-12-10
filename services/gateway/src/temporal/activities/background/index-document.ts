import invariant from 'tiny-invariant';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { getObject, S3_SERVE_BUCKET } from '../../../util/s3';
import { transcriptSegmentSchema } from '../../../util/zod';

export type DocumentKind = 'transcript' | 'organization' | 'channel';

async function getDocument(kind: DocumentKind, id: string) {
  switch (kind) {
    case 'transcript':
      const key = `${id}.vtt`;
      const res = await getObject(S3_SERVE_BUCKET, key);
      const body = await res.Body?.transformToString('utf-8');
      invariant(body, `No object with key ${key} found`);
      const parsed = parseVtt(body)
        .filter((n): n is NodeCue => n.type === 'cue')
        .map(({ data: { start, end, text } }) => ({ start, end, text }));

      return {
        index: 'lc_transcripts',
        id,
        document: escapeDocument({
          segments: transcriptSegmentSchema.parse(parsed),
        }),
      };
    case 'organization':
      return {
        index: 'lc_organizations',
        id,
        document: await prisma.organization.findUniqueOrThrow({
          where: { id },
          select: { name: true },
        }),
      };
    case 'channel':
      return {
        index: 'lc_organizations',
        id,
        document: await prisma.channel.findUniqueOrThrow({
          where: { id },
          select: { name: true },
        }),
      };
    default:
      const un: never = kind;
      throw new Error(`Unknown document kind: ${un}`);
  }
}

export default async function indexDocument(kind: DocumentKind, id: string) {
  const doc = await getDocument(kind, id);

  const indexRes = await client.index(doc);

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  console.log('Done!');
}
