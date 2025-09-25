import { createFileRoute, Outlet } from '@tanstack/react-router';
import BottomTabBar from '@/components/bottom-tab-bar';
import Sidebar from '@/components/sidebar';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 sm:pb-0">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
