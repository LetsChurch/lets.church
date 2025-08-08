import SubscribersIcon from '@tabler/icons/outline/rss.svg?component-solid';
import PlayIcon from '@tabler/icons/outline/player-play.svg?component-solid';
import MenuIcon from '@tabler/icons/outline/dots-vertical.svg?component-solid';
import { createSignal } from 'solid-js';
import { useFloating } from 'solid-floating-ui';
import humanNumber from 'human-number';
import { A } from '@solidjs/router';
import FloatingMenu from './floating-menu';

export type Props = {
  id: string;
  name: string;
  subscribersCount: number;
  uploadsCount: number;
};
export default function ChannelCard(props: Props) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'bottom-end',
  });

  return (
    <div class="relative col-span-1 flex rounded-md shadow-sm">
      <div class="flex w-16 flex-shrink-0 items-center justify-center rounded-l-md bg-indigo-600 text-sm font-medium text-white">
        {props.name
          .split(/\s+/)
          .slice(0, 2)
          .map(([s]) => s)
          .join('')}
      </div>
      <div class="flex flex-1 items-center justify-between truncate rounded-r-md border-b border-r border-t border-gray-200 bg-white">
        <div class="flex-1 truncate px-4 py-2 text-sm">
          <A
            href={props.id}
            class="font-medium text-gray-900 before:absolute before:inset-0 hover:text-gray-600"
          >
            {props.name}
          </A>
          <dl class="flex items-center text-gray-500">
            <dt class="contents">
              <SubscribersIcon class="h-5 w-5" />
              <span class="sr-only">Subscribers</span>
            </dt>
            <dd class="mr-2">{humanNumber(props.subscribersCount)}</dd>
            <dt class="contents">
              <PlayIcon class="h-5 w-5" />
              <span class="sr-only">Uploads</span>
            </dt>
            <dd class="mr-2">{humanNumber(props.uploadsCount)}</dd>
          </dl>
        </div>
        <div class="z-10 flex-shrink-0 pr-2">
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-500"
            id="pinned-project-options-menu-0-button"
            aria-expanded="false"
            aria-haspopup="true"
            ref={setReference}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(true);
            }}
          >
            <span class="sr-only">Open options</span>
            <MenuIcon class="h-5 w-5" />
          </button>
          <FloatingMenu
            ref={setFloating}
            open={showMenu()}
            position={position}
            onClose={() => setShowMenu(false)}
            links={[
              { label: 'Show', href: props.id },
              { label: 'Edit', href: `${props.id}/edit` },
              { label: 'Delete', action: () => confirm('Delete?') },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
