import invariant from 'tiny-invariant';
import * as Z from 'zod';
import { client, escapeDocument } from '../../../util/elasticsearch';
import prisma from '../../../util/prisma';
import { assemblyAiWordSchema } from '../../../util/zod';

const transformTranscriptSchema = Z.array(
  assemblyAiWordSchema.omit({ confidence: true }),
);

export type DocumentType = 'transcript';

async function getDocument(kind: DocumentType, id: string) {
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
    default:
      const un: never = kind;
      throw new Error(`Unknown document kind: ${un}`);
  }
}

export default async function indexDocument(kind: DocumentType, id: string) {
  const doc = await getDocument(kind, id);

  const indexRes = await client.index(doc);

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  console.log('Done!');
}
