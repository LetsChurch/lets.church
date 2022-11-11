import envariant from '@knpwrs/envariant';
import prisma from '../../../util/prisma';
import { putFile } from '../../../util/s3';
import { assemblyAiSentencesSchema } from '../../../util/zod';

const ASSEMBLY_AI_API_KEY = envariant('ASSEMBLY_AI_API_KEY');

export default async function (uploadId: string, transcriptId: string) {
  console.log(`Requesting transcript ${transcriptId} for ${uploadId}`);
  const res = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    {
      method: 'GET',
      headers: {
        Authorization: ASSEMBLY_AI_API_KEY,
      },
    },
  );
  const transcriptJson = await res.text();
  console.log(
    `Received ${res.headers.get('Content-Length')} bytes of ${res.headers.get(
      'Content-Type',
    )}`,
  );

  console.log(`Requesting sentences ${transcriptId} for ${uploadId}`);
  const sentencesRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}/sentences`,
    {
      method: 'GET',
      headers: {
        Authorization: ASSEMBLY_AI_API_KEY,
      },
    },
  );
  const sentencesJson = await sentencesRes.text();
  console.log(
    `Received ${res.headers.get('Content-Length')} bytes of ${res.headers.get(
      'Content-Type',
    )}`,
  );

  console.log(`Requesting paragraphs ${transcriptId} for ${uploadId}`);
  const paragraphsRes = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`,
    {
      method: 'GET',
      headers: {
        Authorization: ASSEMBLY_AI_API_KEY,
      },
    },
  );
  const paragraphsJson = await paragraphsRes.text();
  console.log(
    `Received ${res.headers.get('Content-Length')} bytes of ${res.headers.get(
      'Content-Type',
    )}`,
  );

  console.log('Uploading transcripts');
  await putFile(
    `${uploadId}.transcript.json`,
    'application/json',
    Buffer.from(transcriptJson),
  );
  console.log('Uploaded transcript');
  await putFile(
    `${uploadId}.sentences.json`,
    'application/json',
    Buffer.from(sentencesJson),
  );
  console.log('Uploaded sentences');
  await putFile(
    `${uploadId}.paragraphs.json`,
    'application/json',
    Buffer.from(paragraphsJson),
  );
  console.log('Uploaded paragraphs');

  console.log('Saving transcript to database');
  const { sentences } = assemblyAiSentencesSchema.parse(
    JSON.parse(sentencesJson),
  );

  await prisma.uploadRecord.update({
    data: { transcriptSentences: sentences.map(({ words, ...rest }) => rest) },
    where: { id: uploadId },
  });
}
