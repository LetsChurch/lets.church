export type UploadRecordCreateData = {
  title?: string | null;
  description?: string | null;
  license?: string;
  visibility?: string;
  publishedAt?: Date | string;
  userCommentsEnabled?: boolean;
  uploadFinalized?: boolean;
  uploadFinalizedAt?: Date | string;
  uploadFinalizedById?: string;
  uploadFinalizedByUsername?: string;
  finalizedUploadKey?: string;
  appUserId?: string;
  createdByUsername?: string;
  channelId?: string;
  channelSlug?: string;
  [key: string]: unknown;
};

export type CreateUploadRecordActivityInput = {
  data: UploadRecordCreateData;
  creationOperationId: string;
  creationRequestFingerprint: string;
};

function canonicalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Canonical representation of the caller-controlled fields used to create an
 * upload row. Values generated inside the activity are intentionally absent.
 */
export function fingerprintUploadRecordCreateData(
  data: UploadRecordCreateData,
): string {
  return JSON.stringify({
    title: data.title ?? null,
    description: data.description ?? null,
    creator: data.appUserId
      ? { appUserId: data.appUserId }
      : { createdByUsername: data.createdByUsername ?? null },
    channel: data.channelId
      ? { channelId: data.channelId }
      : { channelSlug: data.channelSlug ?? null },
    license: data.license ?? 'STANDARD',
    visibility: data.visibility ?? 'PUBLIC',
    uploadFinalized: data.uploadFinalized ?? false,
    uploadFinalizedAt: canonicalDate(data.uploadFinalizedAt),
    uploadFinalizedBy: data.uploadFinalizedById
      ? { uploadFinalizedById: data.uploadFinalizedById }
      : { uploadFinalizedByUsername: data.uploadFinalizedByUsername ?? null },
    finalizedUploadKey: data.finalizedUploadKey ?? null,
    publishedAt: canonicalDate(data.publishedAt),
    userCommentsEnabled: data.userCommentsEnabled ?? true,
  });
}
