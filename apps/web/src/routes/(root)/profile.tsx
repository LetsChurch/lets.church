import { Outlet } from 'solid-start';
import { useCrumb } from '~/components/page-breadcrumbs';

export default function ProfileLayout() {
  useCrumb({ title: 'Profile', href: '/profile' });

  return <Outlet />;
}
