import { createFileRoute, Outlet } from '@tanstack/react-router';
import appCss from '@/app.css?url';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
});

function RouteComponent() {
  return (
    <div>
      <p>main layout</p>
      <Outlet />
    </div>
  );
}
