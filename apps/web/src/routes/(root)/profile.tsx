import { For } from 'solid-js';
import { A, Outlet } from 'solid-start';
import ProfileIcon from '@tabler/icons/user-circle.svg?component-solid';
import AntennaIcon from '@tabler/icons/antenna.svg?component-solid';
import { Dynamic } from 'solid-js/web';

const links = [
  {
    title: 'Profile',
    href: '/profile',
    icon: ProfileIcon,
    end: true,
  },
  { title: 'Channels', href: '/profile/channels', icon: AntennaIcon },
];

export default function ProfileLayout() {
  return (
    <div class="lg:grid lg:grid-cols-12">
      <aside class="py-16 pr-8 lg:col-span-3">
        <nav class="space-y-1">
          <For each={links}>
            {({ href, title, icon, end = false }) => (
              <A
                href={href}
                class="group flex items-center rounded-sm border-l-4 border-transparent px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 hover:text-gray-900"
                activeClass="bg-gray-50 text-gray-900"
                end={end}
              >
                <Dynamic component={icon} class="mr-4 text-gray-400" />
                {title}
              </A>
            )}
          </For>
        </nav>
      </aside>
      <div class="px-4 py-6 lg:col-span-9">
        <Outlet />
      </div>
    </div>
  );
}
