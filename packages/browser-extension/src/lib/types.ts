/** A video as read from YouTube Studio's own API (see `studio-api.ts`). */
export type StudioVideo = {
  videoId: string;
  title: string;
  description: string;
  lengthSeconds: number | null;
  /** Publish time, or creation time for never-published (e.g. private) videos. */
  publishedAt: number;
  privacy: 'public' | 'unlisted' | 'private' | 'unknown';
  originalFileName: string | null;
  /** Absolute `download_my_video` URL; tokenized and short-lived. */
  downloadUrl: string | null;
  /** Largest thumbnail Studio offers (signed i9.ytimg.com URL), if any. */
  thumbnailUrl: string | null;
  youtubeChannelId: string | null;
};

export type LcVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export type LcChannel = { id: string; name: string; slug: string };

export type LcContext = {
  username: string | null;
  channels: Array<LcChannel>;
};

export type DuplicateMatch = {
  uploadId: string;
  title: string | null;
  confidence: 'exact' | 'likely';
};

export type JobStatus =
  | 'queued'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled';

/**
 * One video being mirrored. Lives in `storage.local` under `job:<id>` so the
 * queue page (the only thing that runs transfers) and the Studio/popup UIs
 * can all observe it.
 */
export type MirrorJob = {
  id: string;
  createdAt: number;
  video: StudioVideo;
  channelId: string;
  channelName: string;
  visibility: LcVisibility | null;
  status: JobStatus;
  bytesTotal: number | null;
  bytesUploaded: number;
  error: string | null;
  /** Something non-fatal went wrong (e.g. the thumbnail didn't mirror). */
  warning: string | null;
  /** Set once `createUpload` succeeds; needed to finalize or abort. */
  upload: {
    uploadId: string;
    s3UploadId: string;
    s3UploadKey: string;
  } | null;
};
