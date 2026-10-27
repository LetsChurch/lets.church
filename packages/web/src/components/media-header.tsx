import { MediaActions } from '@/components/media-actions';

type MediaDownloadKind =
  | 'VIDEO_4K'
  | 'VIDEO_1080P'
  | 'VIDEO_720P'
  | 'VIDEO_480P'
  | 'AUDIO'
  | 'TRANSCRIPT_VTT'
  | 'TRANSCRIPT_TXT'
  | 'TRANSCRIPT_JSON';

type MediaHeaderProps = {
  title: string | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
    subscriberCount: number;
    isFollowing: boolean;
  };
  ratingData: {
    likes: number;
    dislikes: number;
    userRating: 'LIKE' | 'DISLIKE' | null;
  };
  onRate: (rating: 'LIKE' | 'DISLIKE') => void;
  onFollowToggle: () => void;
  isSaved: boolean;
  onSaveToggle: () => void;
  shareData: {
    title: string;
    url: string;
  };
  downloadData?: {
    enabled: boolean;
    urls: Array<{ kind: MediaDownloadKind; label: string; url: string }>;
  };
  mediaDimensions?: {
    width: number;
    height: number;
  };
  hasVideo?: boolean;
  hasAudio?: boolean;
  uploadId?: string;
  canEditUpload?: boolean;
  publishedAt?: Date | string | null;
  lengthSeconds?: number | null;
};

export function MediaHeader({
  title,
  channel,
  ratingData,
  onRate,
  onFollowToggle,
  isSaved,
  onSaveToggle,
  shareData,
  downloadData,
  mediaDimensions,
  hasVideo,
  hasAudio,
  uploadId,
  canEditUpload,
  publishedAt,
  lengthSeconds,
}: MediaHeaderProps) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {/* Title */}
      <h1 className="text-primary text-lg leading-normal font-bold">
        {title ? title : 'Untitled'}
      </h1>

      {/* Channel & Actions */}
      <MediaActions
        ratingData={ratingData}
        onRate={onRate}
        shareData={shareData}
        downloadData={downloadData}
        channelData={channel}
        onFollowToggle={onFollowToggle}
        isSaved={isSaved}
        onSaveToggle={onSaveToggle}
        mediaDimensions={mediaDimensions}
        hasVideo={hasVideo}
        hasAudio={hasAudio}
        uploadId={uploadId}
        canEditUpload={canEditUpload}
        mediaTitle={title}
        publishedAt={publishedAt}
        lengthSeconds={lengthSeconds}
      />
    </div>
  );
}
