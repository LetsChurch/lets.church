import { createFileRoute, Outlet } from '@tanstack/react-router';

import MainLayout from '@/components/main-layout';

export const Route = createFileRoute('/_main/about')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <MainLayout containerClassName="">
      <Outlet />
    </MainLayout>
  );
}
