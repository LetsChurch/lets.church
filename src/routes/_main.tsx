import { createFileRoute, Outlet } from '@tanstack/react-router';
import Sidebar from '@/components/sidebar';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
