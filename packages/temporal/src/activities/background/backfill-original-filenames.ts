import { db, UploadRecord } from '@letschurch/db';
import { ingestS3 } from '@letschurch/s3/ingest';
import { makeChunkedTokenizerFromS3 } from '@tokenizer/s3';
import { eq, sql } from 'drizzle-orm';
import { fileTypeFromTokenizer } from 'file-type';
import sanitizeFilename from 'sanitize-filename';

export async function getBackfillFilenamesCount(): Promise<number> {
  const rawResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count FROM "upload_record"
    WHERE "upload_finalized" = true
      AND "finalized_upload_key" IS NOT NULL
      AND "original_file_name" IS NULL
  `);
  return Number(rawResult.rows[0]?.count ?? 0);
}

export type BackfillFilenamesBatchResult = {
  processed: number;
  updated: number;
  remaining: number;
};

export async function backfillFilenamesBatch(
  batchSize: number,
): Promise<BackfillFilenamesBatchResult> {
  const records = await db.execute<{
    id: string;
    finalized_upload_key: string | null;
    title: string | null;
  }>(sql`
    SELECT id, finalized_upload_key, title
    FROM "upload_record"
    WHERE "upload_finalized" = true
      AND "finalized_upload_key" IS NOT NULL
      AND "original_file_name" IS NULL
    LIMIT ${batchSize}
  `);

  if (records.rows.length === 0) {
    return { processed: 0, updated: 0, remaining: 0 };
  }

  let updated = 0;

  for (const record of records.rows) {
    try {
      // Skip if somehow finalizedUploadKey is null
      if (!record.finalized_upload_key) {
        continue;
      }

      // Try to get ContentType from S3 metadata first
      let extension: string | null = null;

      try {
        const headResponse = await ingestS3.headObject(
          record.finalized_upload_key,
        );
        const ContentType = headResponse?.ContentType;

        // If ContentType is specific (not generic), extract extension
        if (
          ContentType &&
          !ContentType.startsWith('application/octet-stream') &&
          !ContentType.endsWith('/*')
        ) {
          // Map MIME type to extension
          const mimeToExt: Record<string, string> = {
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
          extension = mimeToExt[ContentType] || null;
        }
      } catch (error) {
        console.warn(`Failed to get ContentType for ${record.id}:`, error);
      }

      // Fallback to file-type detection if ContentType didn't work
      if (!extension) {
        try {
          const s3Tokenizer = await makeChunkedTokenizerFromS3(
            ingestS3.getS3Client(),
            {
              Bucket: ingestS3.getBucket(),
              Key: record.finalized_upload_key,
            },
          );

          const fileType = await fileTypeFromTokenizer(s3Tokenizer);
          extension = fileType?.ext || null;
        } catch (error) {
          console.error(`Failed to detect file type for ${record.id}:`, error);
        }
      }

      // Update record if we found an extension
      // Create filename as title + extension
      if (extension) {
        const title = sanitizeFilename(record.title || 'media');
        const filename = `${title}.${extension}`;

        await db
          .update(UploadRecord)
          .set({ originalFileName: filename, updatedAt: new Date() })
          .where(eq(UploadRecord.id, record.id));
        updated++;
      }
    } catch (error) {
      console.error(`Failed to process ${record.id}:`, error);
      // Continue with next record
    }
  }

  const remaining = await getBackfillFilenamesCount();
  return { processed: records.rows.length, updated, remaining };
}
