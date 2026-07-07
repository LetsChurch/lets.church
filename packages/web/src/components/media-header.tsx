import { Link } from '@tanstack/react-router';

import { Avatar } from '@/components/avatar';
import { MediaActions } from '@/components/media-actions';

type MediaDownloadKind =
  | 'VIDEO_4K'
  | 'VIDEO_1080P'
  | 'VIDEO_720P'
  | 'VIDEO_480P'
  | 'AUDIO'
  | 'TRANSCRIPT_VTT'
  | 'TRANSCRIPT_TXT';

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
        channelData={{
          id: channel.id,
          name: channel.name,
          isFollowing: channel.isFollowing,
        }}
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
        channelLink={
          <Link
            to="/channel/$slug"
            params={{ slug: channel.slug }}
            className="flex shrink-0 items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <Avatar
              src={channel.avatarUrl}
              alt={channel.name}
              className="border-fancy-pants size-7"
              fallbackClassName="bg-brand font-bold text-xs"
            />
            <div className="flex flex-col gap-0.5">
              <div className="text-primary text-xs font-semibold">
                {channel.name}
              </div>
              <div className="text-[10px] text-zinc-400">
                {channel.subscriberCount.toLocaleString()}{' '}
                {channel.subscriberCount === 1 ? 'follower' : 'followers'}
              </div>
            </div>
          </Link>
        }
      />
    </div>
  );
}
