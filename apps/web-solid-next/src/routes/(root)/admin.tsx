import ClipboardIcon from '@tabler/icons/clipboard-data.svg?component-solid';
import ProfileIcon from '@tabler/icons/user-circle.svg?component-solid';
import AntennaIcon from '@tabler/icons/antenna.svg?component-solid';
import ChurchIcon from '@tabler/icons/building-church.svg?component-solid';
import { ParentProps } from 'solid-js';
import Sidenav from '~/components/sidenav';

const links = [
  {
    title: 'Admin',
    href: '/admin',
    icon: (props: { class: string }) => <ClipboardIcon class={props.class} />,
    end: true,
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: (props: { class: string }) => <ProfileIcon class={props.class} />,
  },
  {
    title: 'Channels',
    href: '/admin/channels',
    icon: (props: { class: string }) => <AntennaIcon class={props.class} />,
  },
  {
    title: 'Organizations',
    href: '/admin/organizations',
    icon: (props: { class: string }) => <ChurchIcon class={props.class} />,
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
