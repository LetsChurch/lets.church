import { Avatar } from '@base-ui-components/react/avatar';
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
}: MediaHeaderProps) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {/* Title */}
      <h1 className="font-bold text-lg text-white leading-normal">
        {title ? title : 'Untitled'}
      </h1>

      {/* Channel & Actions */}
      <div className="flex items-center gap-2.5 overflow-x-auto">
        {/* Channel Info */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Avatar.Root className="size-7 overflow-hidden rounded-full border-top-highlight">
            {channel.avatarUrl ? (
              <Avatar.Image src={channel.avatarUrl} alt={channel.name} />
            ) : null}
            <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-indigo-500 font-bold text-white text-xs">
              {channel.name.charAt(0).toUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
          <div className="flex flex-col gap-0.5">
            <div className="font-semibold text-white text-xs">
              {channel.name}
            </div>
            <div className="text-[10px] text-zinc-400">
              {channel.subscriberCount.toLocaleString()}{' '}
              {channel.subscriberCount === 1 ? 'follower' : 'followers'}
            </div>
          </div>
        </div>

        {/* Actions */}
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
        />
      </div>
    </div>
  );
}
