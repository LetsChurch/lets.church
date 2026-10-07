/**
 * Let's Church API client. Calls `dashboard.mirror.*` on the web app's tRPC
 * endpoint, authenticated by the user's normal `lc-session` cookie (the
 * extension has host permissions for the site, so the browser attaches it).
 *
 * Runs only in extension contexts (background, queue page, popup) — a Studio
 * content script can't reach lets.church directly, so it goes through the
 * background (see `messages.ts`).
 *
 * The types below mirror `packages/web/src/trpc/procedures/dashboard/mirror.ts`
 * and its schemas; keep them in sync.
 */
import {
  createTRPCUntypedClient,
  httpLink,
  TRPCClientError,
} from '@trpc/client';
import superjson from 'superjson';

import { LC_URL } from './config';
import type { DuplicateMatch, LcContext, LcVisibility } from './types';

const client = createTRPCUntypedClient({
  links: [
    httpLink({
      url: `${LC_URL}/trpc`,
      transformer: superjson,
      fetch: (url, init) =>
        fetch(url, { ...(init as RequestInit), credentials: 'include' }),
    }),
  ],
});

export type MultipartTarget = {
  uploadId: string;
  s3UploadKey: string;
  s3UploadId: string;
  partSize: number;
  urls: Array<string>;
};

export class NotSignedInError extends Error {
  override name = 'NotSignedInError';
}

/** Turn tRPC errors into messages a person can act on. */
export function describeApiError(err: unknown): string {
  if (err instanceof NotSignedInError) {
    return err.message;
  }
  if (err instanceof TRPCClientError) {
    const code = (err.data as { code?: string } | undefined)?.code;
    if (code === 'UNAUTHORIZED') {
      return "You're not signed in to Let's Church (or can't upload to this channel).";
    }
    if (code === 'FORBIDDEN') {
      return "You don't have permission to upload to this channel.";
    }
    return err.message;
  }
  // fetch() rejects with a bare TypeError ("Failed to fetch" / "NetworkError…")
  // when the request never got a response: offline, blocked, or no host access.
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (err instanceof TypeError || cause instanceof TypeError) {
    return `Couldn't reach Let's Church at ${LC_URL}. Check your connection and that the extension is allowed to access that site.`;
  }
  return err instanceof Error ? err.message : String(err);
}

function isUnauthorized(err: unknown) {
  return (
    err instanceof TRPCClientError &&
    (err.data as { code?: string } | undefined)?.code === 'UNAUTHORIZED'
  );
}

export const lcApi = {
  /** `null` when not signed in. */
  async getContext(): Promise<LcContext | null> {
    try {
      return (await client.query('dashboard.mirror.getContext')) as LcContext;
    } catch (err) {
      if (isUnauthorized(err)) {
        return null;
      }
      throw err;
    }
  },

  findDuplicates(input: {
    channelId: string;
    candidates: Array<{
      key: string;
      title: string;
      publishedAt: Date;
      lengthSeconds: number | null;
      originalFileName: string | null;
    }>;
  }): Promise<Record<string, DuplicateMatch>> {
    return client.query('dashboard.mirror.findDuplicates', input) as Promise<
      Record<string, DuplicateMatch>
    >;
  },

  createUpload(input: {
    channelId: string;
    title: string;
    description: string;
    publishedAt: Date;
    originalFileName?: string;
    uploadMimeType: string;
    bytes: number;
    visibility?: LcVisibility;
  }): Promise<MultipartTarget> {
    return client.mutation(
      'dashboard.mirror.createUpload',
      input,
    ) as Promise<MultipartTarget>;
  },

  finalizeUpload(input: {
    channelId: string;
    uploadId: string;
    s3UploadId: string;
    s3UploadKey: string;
    s3PartETags: Array<string>;
  }): Promise<{ uploadId: string }> {
    return client.mutation(
      'dashboard.mirror.finalizeUpload',
      input,
    ) as Promise<{
      uploadId: string;
    }>;
  },

  createThumbnailUpload(input: {
    channelId: string;
    uploadId: string;
    uploadMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    bytes: number;
  }): Promise<Omit<MultipartTarget, 'uploadId'>> {
    return client.mutation(
      'dashboard.mirror.createThumbnailUpload',
      input,
    ) as Promise<Omit<MultipartTarget, 'uploadId'>>;
  },

  abortThumbnailUpload(input: {
    channelId: string;
    uploadId: string;
    s3UploadId: string;
    s3UploadKey: string;
  }): Promise<{ uploadId: string }> {
    return client.mutation(
      'dashboard.mirror.abortThumbnailUpload',
      input,
    ) as Promise<{ uploadId: string }>;
  },

  abortUpload(input: {
    channelId: string;
    uploadId: string;
    s3UploadId: string;
    s3UploadKey: string;
  }): Promise<{ uploadId: string }> {
    return client.mutation('dashboard.mirror.abortUpload', input) as Promise<{
      uploadId: string;
    }>;
  },
};
