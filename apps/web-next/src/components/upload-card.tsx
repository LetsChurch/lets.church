import { A } from '@solidjs/router';
import Thumbnail from './thumbnail';
import { Avatar } from './avatar';
import type { UploadCardFieldsFragment } from '~/util/gql/__generated__/fragments';

export type Props = {
  href: string;
  data: UploadCardFieldsFragment;
};

export default function UploadCard(props: Props) {
  const resolvedTitle = () => props.data.title || 'Untitled';

  return (
    <div class="relative space-y-3">
      <div class="aspect-video overflow-hidden bg-gray-100">
        <Thumbnail
          url={
            props.data.thumbnailUrl ?? props.data.channel.defaultThumbnailUrl
          }
          lqUrl={
            props.data.thumbnailLqUrl ??
            props.data.channel.defaultThumbnailLqUrl
          }
          width={488}
          height={Math.round((488 * 9) / 16)}
          placeholder="audio"
          lengthSeconds={props.data.lengthSeconds}
        />
      </div>
      <div class="flex items-center space-x-3 overflow-hidden">
        <Avatar
          size="sm"
          name={props.data.channel.name}
          src={props.data.channel.avatarUrl}
          alt={props.data.channel.name}
        />
        <A
          href={props.href}
          class="block min-w-0 before:absolute before:inset-0"
          title={resolvedTitle()}
        >
          <p class="truncate text-sm font-medium text-gray-900">
            {resolvedTitle()}
          </p>
          <p class="truncate text-sm text-gray-500">
            {props.data.channel.name}
          </p>
        </A>
      </div>
    </div>
  );
}
