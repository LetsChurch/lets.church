import { Outlet } from 'solid-start';
import ProfileIcon from '@tabler/icons/user-circle.svg?component-solid';
import AntennaIcon from '@tabler/icons/antenna.svg?component-solid';
import Sidenav from '~/components/sidenav';

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
      <Sidenav class="lg:col-span-3" links={links} />
      <div class="px-4 py-6 lg:col-span-9">
        <Outlet />
      </div>
    </div>
  );
}
