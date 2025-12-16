import { IconMenu2 } from '@tabler/icons-react';
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { useState } from 'react';
import BottomTabBar from '@/components/bottom-tab-bar';
import MobileMenu from '@/components/mobile-menu';
import Sidebar from '@/components/sidebar';

export const Route = createFileRoute('/_main')({
  component: RouteComponent,
});

function RouteComponent() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const matches = useMatches();

  // Only show FAB on churches pages (which don't have their own Header component)
  const isChurchesPage = matches.some(
    (match) =>
      match.routeId === '/_main/churches' ||
      match.routeId === '/_main/churches_/$slug',
  );

  return (
    <div className="flex h-screen bg-page">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden pb-16 sm:pb-0">
        {/* Floating Menu Button - Mobile Only, only on churches pages */}
        {isChurchesPage ? (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="fixed top-4 left-4 z-40 flex size-10 items-center justify-center rounded-lg border-fancy-pants bg-white/90 text-primary shadow-lg backdrop-blur-sm transition-colors hover:bg-white sm:hidden dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
          >
            <IconMenu2 />
          </button>
        ) : null}

        <Outlet />
      </main>
      <BottomTabBar />
      <MobileMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
    </div>
  );
}
