import { prisma } from '@letschurch/db';
import { makeChunkedTokenizerFromS3 } from '@tokenizer/s3';
import { fileTypeFromTokenizer } from 'file-type';
import sanitizeFilename from 'sanitize-filename';
import { ingestS3 } from '../../util/s3';

export async function getBackfillFilenamesCount(): Promise<number> {
  return prisma.uploadRecord.count({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      originalFileName: null,
    },
  });
}

export type BackfillFilenamesBatchResult = {
  processed: number;
  updated: number;
  remaining: number;
};

export async function backfillFilenamesBatch(
  batchSize: number,
): Promise<BackfillFilenamesBatchResult> {
  const records = await prisma.uploadRecord.findMany({
    where: {
      uploadFinalized: true,
      finalizedUploadKey: { not: null },
      originalFileName: null,
    },
    take: batchSize,
    select: {
      id: true,
      finalizedUploadKey: true,
      title: true,
    },
  });

  if (records.length === 0) {
    return { processed: 0, updated: 0, remaining: 0 };
  }

  let updated = 0;

  for (const record of records) {
    try {
      // Skip if somehow finalizedUploadKey is null
      if (!record.finalizedUploadKey) {
        continue;
      }

      // Try to get ContentType from S3 metadata first
      let extension: string | null = null;

      try {
        const headResponse = await ingestS3.headObject(
          record.finalizedUploadKey,
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
              Key: record.finalizedUploadKey,
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

        await prisma.uploadRecord.update({
          where: { id: record.id },
          data: { originalFileName: filename },
        });
        updated++;
      }
    } catch (error) {
      console.error(`Failed to process ${record.id}:`, error);
      // Continue with next record
    }
  }

  const remaining = await getBackfillFilenamesCount();
  return { processed: records.length, updated, remaining };
}
