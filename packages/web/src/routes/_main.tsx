import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import BottomTabBar from '@/components/bottom-tab-bar';
import Sidebar from '@/components/sidebar';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  const { pathname } = useLocation();
  // The dashboard has its own section-nav sidebar, so collapse the site sidebar
  // to a rail by default there to give the dashboard more room.
  const isDashboard = pathname.startsWith('/dashboard');

  return (
    <div className="flex h-screen bg-page">
      <Sidebar forceCollapsed={isDashboard} />
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden pb-16 sm:pb-0">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
