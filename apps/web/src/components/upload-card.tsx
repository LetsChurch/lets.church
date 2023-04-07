import { A } from 'solid-start';
import Thumbnail from './thumbnail';
import { Avatar } from './avatar';
import type { Optional } from '~/util';

export type VideoCardProps = {
  title?: Optional<string>;
  channel: Optional<string>;
  href: string;
  thumbnailUrl: Optional<string>;
  blurhash: Optional<string>;
  avatarUrl: string;
};

export default function UploadCard(props: VideoCardProps) {
  const resolvedTitle = () => props.title || 'Untitled';

  return (
    <div class="relative space-y-3">
      <div class="aspect-video overflow-hidden bg-gray-100">
        <Thumbnail
          url={props.thumbnailUrl}
          blurhash={props.blurhash}
          width={488}
          height={Math.round((488 * 9) / 16)}
          placeholder="audio"
        />
      </div>
      <div class="flex items-center space-x-3 overflow-hidden">
        <Avatar size="sm" src={props.avatarUrl} alt={resolvedTitle()} />
        <A
          href={props.href}
          class="block min-w-0 before:absolute before:inset-0"
        >
          <p class="truncate text-sm font-medium text-gray-900">
            {resolvedTitle()}
          </p>
          <p class="truncate text-sm text-gray-500">{props.channel}</p>
        </A>
      </div>
    </div>
  );
}
