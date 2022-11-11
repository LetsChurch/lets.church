import invariant from 'tiny-invariant';
import * as Z from 'zod';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { assemblyAiWordSchema } from '../../../util/zod';

const transformTranscriptSchema = Z.array(
  assemblyAiWordSchema.omit({ confidence: true }),
);

export type DocumentKind = 'transcript' | 'organization' | 'channel';

async function getDocument(kind: DocumentKind, id: string) {
  switch (kind) {
    case 'transcript':
      const { transcriptSentences } =
        await prisma.uploadRecord.findUniqueOrThrow({
          select: { transcriptSentences: true },
          where: { id },
        });

      return {
        index: 'lc_transcripts',
        id,
        document: escapeDocument({
          sentences: transformTranscriptSchema.parse(transcriptSentences),
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
