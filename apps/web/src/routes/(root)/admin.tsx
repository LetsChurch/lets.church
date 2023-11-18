import { Outlet } from 'solid-start';
import ClipboardData from '@tabler/icons/clipboard-data.svg?component-solid';
import ProfileIcon from '@tabler/icons/user-circle.svg?component-solid';
import AntennaIcon from '@tabler/icons/antenna.svg?component-solid';
import ChurchIcon from '@tabler/icons/building-church.svg?component-solid';
import Sidenav from '~/components/sidenav';

const links = [
  { title: 'Admin', href: '/admin', icon: ClipboardData, end: true },
  {
    title: 'Users',
    href: '/admin/users',
    icon: ProfileIcon,
  },
  { title: 'Channels', href: '/admin/channels', icon: AntennaIcon },
  { title: 'Organizations', href: '/admin/organizations', icon: ChurchIcon },
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
