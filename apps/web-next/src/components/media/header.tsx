import { A, useLocation } from '@solidjs/router';
import { For, Show } from 'solid-js';
import Search from './search';
import { cn } from '~/util';

const mediaLinks = [
  {
    href: '/',
    title: 'Explore',
    end: true,
  },
  {
    href: '/channels',
    title: 'Channels',
  },
];

export default function MediaHeader(props: { class?: string }) {
  const loc = useLocation();

  // Alternatively, this could move into a media layout and paths can change to be under /media
  function isMediaPage() {
    const p = loc.pathname;
    return p === '/' || p.startsWith('/media');
  }

  return (
    <Show when={isMediaPage()}>
      <div
        class={cn(
          'mx-auto my-5 flex max-w-7xl flex-1 items-center justify-center lg:justify-between',
          props.class,
        )}
      >
        <div class="hidden sm:block">
          <nav class="hidden space-x-4 lg:flex" aria-label="Tabs">
            <For each={mediaLinks}>
              {(link) => (
                <A
                  href={link.href}
                  class="rounded-md px-3 py-2 text-sm font-medium"
                  activeClass="bg-gray-100 text-gray-700"
                  inactiveClass="text-gray-500 hover:text-gray-700"
                  end={link.end}
                >
                  {link.title}
                </A>
              )}
            </For>
          </nav>
        </div>
        <div class="w-full max-w-lg lg:max-w-xs">
          <Search />
        </div>
      </div>
    </Show>
  );
}
