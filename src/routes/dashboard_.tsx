import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MantineWrapper } from './-mantine';

export const Route = createFileRoute('/dashboard_')({
  component: DashboardLayoutComponent,
});

function DashboardLayoutComponent() {
  return (
    <MantineWrapper>
      <div>
        <p>Dashboard layout</p>
        <Outlet />
      </div>
    </MantineWrapper>
  );
}
