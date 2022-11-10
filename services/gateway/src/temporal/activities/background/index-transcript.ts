import invariant from 'tiny-invariant';
import * as Z from 'zod';
import { getObject } from '../../../util/s3';
import { client, escapeDocument } from '../../../util/elasticsearch';

const wordSchema = Z.object({
  text: Z.string(),
  start: Z.number(),
  end: Z.number(),
  confidence: Z.number(),
});

const sentenceSchema = wordSchema.and(
  Z.object({
    words: Z.array(wordSchema),
  }),
);

const sentencesSchema = Z.object({
  sentences: Z.array(sentenceSchema),
  id: Z.string(), // NOT UUID
  confidence: Z.number(),
  audio_duration: Z.number(),
});

export default async function indexTranscript(uploadId: string) {
  const s3Res = await getObject(`${uploadId}.sentences.json`);
  const json = await s3Res.Body?.transformToString();

  invariant(json, 'No JSON returned from S3!');

  const parsed = sentencesSchema.parse(JSON.parse(json));

  const indexRes = await client.index({
    index: 'lc_transcripts',
    id: uploadId,
    document: escapeDocument({
      sentences: parsed.sentences.map(({ start, end, text }) => ({
        start,
        end,
        text,
      })),
    }),
  });

  invariant(
    ['created', 'updated'].includes(indexRes.result),
    `Document not indexed`,
  );

  console.log('Done!');
}
