import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MantineWrapper, mantineStyles } from './-mantine';

export const Route = createFileRoute('/auth_')({
  component: DashboardLayoutComponent,
  head: () => ({
    links: mantineStyles,
  }),
});

function DashboardLayoutComponent() {
  return (
    <MantineWrapper>
      <Outlet />
    </MantineWrapper>
  );
}
