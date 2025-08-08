import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <p>main layout</p>
      <Outlet />
    </div>
  );
}
