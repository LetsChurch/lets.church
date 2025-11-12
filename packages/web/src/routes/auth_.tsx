import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MantineWrapper } from './-mantine';

export const Route = createFileRoute('/auth_')({
  component: DashboardLayoutComponent,
});

function DashboardLayoutComponent() {
  return (
    <MantineWrapper>
      <Outlet />
    </MantineWrapper>
  );
}
