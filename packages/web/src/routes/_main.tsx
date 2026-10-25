import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';

import BottomTabBar from '@/components/bottom-tab-bar';
import {
  PersistentPlayerHost,
  useIsMiniPlayerOpen,
} from '@/components/persistent-player';
import Sidebar from '@/components/sidebar';
import { cn } from '@/util/cn';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  const { pathname } = useLocation();
  // The dashboard has its own section-nav sidebar, so collapse the site sidebar
  // to a rail by default there to give the dashboard more room.
  const isDashboard = pathname.startsWith('/dashboard');
  const isMiniPlayerOpen = useIsMiniPlayerOpen();

  return (
    <div className="bg-page flex h-screen">
      <Sidebar forceCollapsed={isDashboard} />
      <main
        className={cn(
          'relative flex-1 overflow-x-hidden overflow-y-auto',
          // Room for the bottom tab bar, plus the mini player floating above
          // it, on mobile.
          !isDashboard && 'pb-16 sm:pb-0',
          isMiniPlayerOpen && (isDashboard ? 'pb-20 sm:pb-0' : 'pb-36 sm:pb-0'),
        )}
      >
        <Outlet />
      </main>
      {isDashboard ? null : <BottomTabBar />}
      {/* Outside the Outlet so playback outlives the media page. */}
      <PersistentPlayerHost />
    </div>
  );
}
