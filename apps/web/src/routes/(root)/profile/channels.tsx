import { Outlet } from 'solid-start';
import { useCrumb } from '~/components/page-breadcrumbs';

export default function ChannelsLayout() {
  useCrumb({ title: 'My Channels', href: '/profile/channels' });

  return <Outlet />;
}
