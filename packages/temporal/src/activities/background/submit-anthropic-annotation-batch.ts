import { Channel, db, TranscriptParagraph, UploadRecord } from '@letschurch/db';
import { asc, eq, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import {
  type AnthropicBatchRequest,
  submitAnthropicBatch,
} from '../../util/anthropic-batch';
import {
  ANTHROPIC_ANNOTATE_BATCH_MODEL,
  ANNOTATE_FALLBACK_MODEL,
} from '../../util/llm';
import {
  buildAnthropicAnnotationBatchCustomId,
  fingerprintAnnotationSource,
} from '../../util/llm-batch-source';
import logger from '../../util/logger';
import {
  ANNOTATE_SYSTEM_PROMPT_REF,
  buildAnnotationUserContent,
  DEFAULT_ANNOTATION_MAX_TOKENS,
  type EvalParagraph,
} from './annotate-transcript';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/submit-anthropic-annotation-batch',
});

export type SubmitAnthropicAnnotationBatchResult = {
  batchId: string;
  requestCount: number;
};
export function validateAnthropicAnnotationBatchConfig(): void {
  if (
    ANTHROPIC_ANNOTATE_BATCH_MODEL &&
    !process.env.ANTHROPIC_API_KEY?.trim()
  ) {
    throw new Error(
      'ANTHROPIC_API_KEY is required when ANTHROPIC_ANNOTATE_BATCH_MODEL is enabled',
    );
  }
}

export default async function submitAnthropicAnnotationBatch(
  uploadRecordIds: string[],
): Promise<SubmitAnthropicAnnotationBatchResult> {
  invariant(
    ANTHROPIC_ANNOTATE_BATCH_MODEL && ANNOTATE_FALLBACK_MODEL,
    'Anthropic annotation batch fallback is disabled',
  );
  invariant(
    uploadRecordIds.length > 0,
    'submitAnthropicAnnotationBatch: no uploads provided',
  );

  const uploads = await db
    .select({
      id: UploadRecord.id,
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(inArray(UploadRecord.id, uploadRecordIds));
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));

  const paragraphRows = await db
    .select({
      id: TranscriptParagraph.id,
      order: TranscriptParagraph.order,
      text: TranscriptParagraph.text,
      words: TranscriptParagraph.words,
      uploadRecordId: TranscriptParagraph.uploadRecordId,
    })
    .from(TranscriptParagraph)
    .where(inArray(TranscriptParagraph.uploadRecordId, uploadRecordIds))
    .orderBy(asc(TranscriptParagraph.order));
  const paragraphsByUpload = new Map<string, EvalParagraph[]>();
  for (const paragraph of paragraphRows) {
    const paragraphs = paragraphsByUpload.get(paragraph.uploadRecordId) ?? [];
    paragraphs.push(paragraph);
    paragraphsByUpload.set(paragraph.uploadRecordId, paragraphs);
  }

  const requests: AnthropicBatchRequest[] = [];
  for (const uploadId of uploadRecordIds) {
    const upload = uploadById.get(uploadId);
    const paragraphs = paragraphsByUpload.get(uploadId);
    invariant(
      upload,
      `Anthropic annotation batch: upload ${uploadId} not found`,
    );
    invariant(
      paragraphs && paragraphs.length > 0,
      `Anthropic annotation batch: upload ${uploadId} has no paragraphs`,
    );
    requests.push({
      custom_id: buildAnthropicAnnotationBatchCustomId(
        uploadId,
        fingerprintAnnotationSource(upload, paragraphs),
      ),
      params: {
        model: ANTHROPIC_ANNOTATE_BATCH_MODEL,
        max_tokens: DEFAULT_ANNOTATION_MAX_TOKENS,
        system: ANNOTATE_SYSTEM_PROMPT_REF(),
        messages: [
          {
            role: 'user',
            content: buildAnnotationUserContent(paragraphs, upload),
          },
        ],
      },
    });
  }

  const { batchId } = await submitAnthropicBatch(requests);
  moduleLogger.info(
    {
      context: {
        batchId,
        model: ANNOTATE_FALLBACK_MODEL,
        requestCount: requests.length,
      },
    },
    'Submitted Anthropic annotation fallback batch',
  );
  return { batchId, requestCount: requests.length };
}
