import { db, UploadRecord } from '@letschurch/db';
import { ingestS3 } from '@letschurch/s3/ingest';
import { makeChunkedTokenizerFromS3 } from '@tokenizer/s3';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { fileTypeFromTokenizer } from 'file-type';
import sanitizeFilename from 'sanitize-filename';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
};

export async function getBackfillFilenamesCount(): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(
      and(
        eq(UploadRecord.uploadFinalized, true),
        isNotNull(UploadRecord.finalizedUploadKey),
        isNull(UploadRecord.originalFileName),
      ),
    );
  return result[0]?.count ?? 0;
}

export type BackfillFilenamesBatchResult = {
  processed: number;
  updated: number;
  remaining: number;
};

export async function backfillFilenamesBatch(
  batchSize: number,
): Promise<BackfillFilenamesBatchResult> {
  const records = await db
    .select({
      id: UploadRecord.id,
      finalizedUploadKey: UploadRecord.finalizedUploadKey,
      title: UploadRecord.title,
    })
    .from(UploadRecord)
    .where(
      and(
        eq(UploadRecord.uploadFinalized, true),
        isNotNull(UploadRecord.finalizedUploadKey),
        isNull(UploadRecord.originalFileName),
      ),
    )
    .limit(batchSize);

  if (records.length === 0) {
    return { processed: 0, updated: 0, remaining: 0 };
  }

  let updated = 0;

  for (const record of records) {
    // Skip if somehow finalizedUploadKey is null
    if (!record.finalizedUploadKey) {
      continue;
    }

    // A finalized upload is expected to exist. Let S3 lookup failures fail
    // the batch so Temporal can retry instead of treating an outage as
    // missing metadata.
    const { ContentType } = await ingestS3.headObject(
      record.finalizedUploadKey,
    );
    let extension: string | null = null;

    if (
      ContentType &&
      !ContentType.startsWith('application/octet-stream') &&
      !ContentType.endsWith('/*')
    ) {
      extension = EXTENSION_BY_CONTENT_TYPE[ContentType] ?? null;
    }

    // Fallback to file-type detection if ContentType didn't work
    if (!extension) {
      try {
        const s3Tokenizer = await makeChunkedTokenizerFromS3(
          ingestS3.getS3Client(),
          {
            Bucket: ingestS3.getBucket(),
            Key: record.finalizedUploadKey,
          },
        );

        const fileType = await fileTypeFromTokenizer(s3Tokenizer);
        extension = fileType?.ext || null;
      } catch (error) {
        console.error(`Failed to detect file type for ${record.id}:`, error);
      }
    }

    if (extension) {
      const title = sanitizeFilename(record.title || 'media');
      const filename = `${title}.${extension}`;

      await db
        .update(UploadRecord)
        .set({ originalFileName: filename, updatedAt: new Date() })
        .where(eq(UploadRecord.id, record.id));
      updated++;
    }
  }

  const remaining = await getBackfillFilenamesCount();
  return { processed: records.length, updated, remaining };
}
