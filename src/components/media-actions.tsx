import {
  IconBookmark,
  IconDots,
  IconFlag,
  IconMessageCircle2,
  IconShare2,
  IconThumbDown,
  IconThumbUp,
} from '@tabler/icons-react';
import LcButton from '@/components/lc-button';
import LcButtonGroup from '@/components/lc-button-group';
import { cn } from '@/util/cn';

type MediaActionsProps = {
  ratingData: {
    likes: number;
    dislikes: number;
    userRating: 'LIKE' | 'DISLIKE' | null;
  };
  onRate: (rating: 'LIKE' | 'DISLIKE') => void;
};

export function MediaActions({ ratingData, onRate }: MediaActionsProps) {
  return (
    <div className="ml-auto flex flex-shrink-0 items-center gap-2.5">
      {/* Reactions */}
      <LcButtonGroup
        buttons={[
          {
            type: 'button',
            onClick: () => onRate('LIKE'),
            className: cn(ratingData.userRating === 'LIKE' && 'bg-white/10'),
            children: (
              <>
                <IconThumbUp size={16} />
                {ratingData.likes}
              </>
            ),
          },
          {
            type: 'button',
            onClick: () => onRate('DISLIKE'),
            className: cn(ratingData.userRating === 'DISLIKE' && 'bg-white/10'),
            children: <IconThumbDown size={16} />,
          },
        ]}
      />

      {/* Comments */}
      <LcButton className="flex items-center gap-0.5">
        <IconMessageCircle2 size={16} />
        13
      </LcButton>

      {/* Share */}
      <LcButton className="p-1.5">
        <IconShare2 size={16} />
      </LcButton>

      {/* Divider */}
      <div className="h-7 w-px bg-zinc-900" />

      {/* Save */}
      <LcButton className="flex items-center gap-0.5">
        <IconBookmark size={16} />
        Save
      </LcButton>

      {/* Follow */}
      <LcButton className="flex items-center gap-0.5">
        <IconFlag size={16} />
        Follow
      </LcButton>

      {/* More */}
      <LcButton className="p-1.5">
        <IconDots size={16} />
      </LcButton>
    </div>
  );
}
