import ProfileIcon from '@tabler/icons/outline/user-circle.svg?component-solid';
import AntennaIcon from '@tabler/icons/outline/antenna.svg?component-solid';
import { ParentProps } from 'solid-js';
import Sidenav from '~/components/sidenav';

const links = [
  {
    title: 'Profile',
    href: '/profile',
    icon: ProfileIcon,
    end: true,
  },
  {
    title: 'Channels',
    href: '/profile/channels',
    icon: AntennaIcon,
  },
];

export default function ProfileLayout(props: ParentProps) {
  return (
    <div class="lg:grid lg:grid-cols-12">
      <Sidenav class="lg:col-span-3" links={links} />
      <div class="px-4 py-6 lg:col-span-9">{props.children}</div>
    </div>
  );
}
