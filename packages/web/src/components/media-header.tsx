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
}: MediaHeaderProps) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {/* Title */}
      <h1 className="font-bold text-lg text-primary leading-normal">
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
        channelLink={
          <Link
            to="/channel/$slug"
            params={{ slug: channel.slug }}
            className="flex shrink-0 items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <Avatar
              src={channel.avatarUrl}
              alt={channel.name}
              fallbackText={channel.name.charAt(0).toUpperCase()}
              className="size-7 border-fancy-pants"
              fallbackClassName="bg-brand font-bold text-xs"
            />
            <div className="flex flex-col gap-0.5">
              <div className="font-semibold text-primary text-xs">
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
