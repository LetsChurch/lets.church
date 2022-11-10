import envariant from '@knpwrs/envariant';
import { putFile } from '../../util/s3';

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
  const transcript = await res.text();
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
  const sentences = await sentencesRes.text();
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
  const paragraphs = await paragraphsRes.text();
  console.log(
    `Received ${res.headers.get('Content-Length')} bytes of ${res.headers.get(
      'Content-Type',
    )}`,
  );

  console.log('Uploading transcripts');
  await putFile(
    `${uploadId}.transcript.json`,
    'application/json',
    Buffer.from(transcript),
  );
  console.log('Uploaded transcript');
  await putFile(
    `${uploadId}.sentences.json`,
    'application/json',
    Buffer.from(sentences),
  );
  console.log('Uploaded sentences');
  await putFile(
    `${uploadId}.paragraphs.json`,
    'application/json',
    Buffer.from(paragraphs),
  );
  console.log('Uploaded paragraphs');
}
