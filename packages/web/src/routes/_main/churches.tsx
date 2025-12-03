import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ChurchMap } from '@/components/church-map';
import {
  getInitialSidebarCollapsed,
  SIDEBAR_CHANGE_EVENT,
} from '@/stores/sidebar';

export const Route = createFileRoute('/_main/churches')({
  component: RouteComponent,
});

function RouteComponent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialSidebarCollapsed(),
  );

  useEffect(() => {
    const handleSidebarChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(customEvent.detail.collapsed);
    };

    window.addEventListener(SIDEBAR_CHANGE_EVENT, handleSidebarChange);
    return () =>
      window.removeEventListener(SIDEBAR_CHANGE_EVENT, handleSidebarChange);
  }, []);

  // Calculate padding to offset the map center
  // Pane is max-w-sm (24rem = 384px) + 24px padding on each side = 432px total
  // Sidebar collapsed: 56px (w-14), expanded: 200px (w-50)
  const sidebarWidth = sidebarCollapsed ? 56 : 200;
  const paneWidth = 432;
  const mapPadding = {
    left: paneWidth + sidebarWidth,
    top: 0,
    right: 0,
    bottom: 0,
  };

  return (
    <div className="relative size-full">
      <ClientOnly
        fallback={
          <div className="w-full">
            <h2>Loading Map</h2>
          </div>
        }
      >
        <ChurchMap padding={mapPadding} />
      </ClientOnly>

      {/* Floating pane */}
      <div className="pointer-events-none absolute inset-0 p-6">
        <div className="pointer-events-auto h-full max-w-sm rounded-2xl border-fancy-pants bg-white/80 p-6 backdrop-blur-lg dark:bg-zinc-900/80">
          <h1 className="mb-4 font-bold text-2xl text-primary">
            Find Churches
          </h1>
          <p className="text-secondary">
            Explore churches and ministries in your area.
          </p>
        </div>
      </div>
    </div>
  );
}
