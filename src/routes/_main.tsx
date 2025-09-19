import { createFileRoute, Outlet } from '@tanstack/react-router';
import Sidebar from '@/components/sidebar';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen bg-page">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
