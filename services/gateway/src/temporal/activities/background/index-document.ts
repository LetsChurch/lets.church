import invariant from 'tiny-invariant';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { transcriptSegmentSchema } from '../../../util/zod';

export type DocumentKind = 'transcript' | 'organization' | 'channel';

async function getDocument(kind: DocumentKind, id: string) {
  switch (kind) {
    case 'transcript':
      const { transcriptSegments } =
        await prisma.uploadRecord.findUniqueOrThrow({
          select: { transcriptSegments: true },
          where: { id },
        });

      return {
        index: 'lc_transcripts',
        id,
        document: escapeDocument({
          segments: transcriptSegmentSchema.parse(transcriptSegments),
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
