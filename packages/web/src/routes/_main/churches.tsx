import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChurchMap } from '@/components/church-map';
import {
  getInitialSidebarCollapsed,
  SIDEBAR_CHANGE_EVENT,
} from '@/stores/sidebar';

export const Route = createFileRoute('/_main/churches')({
  component: RouteComponent,
});

const BOTTOM_TAB_BAR_HEIGHT = 64; // Height of bottom tab bar in pixels
const COLLAPSED_HEIGHT = 80; // Height when drawer is collapsed
const EXPANDED_HEIGHT_PERCENT = 75; // Percentage of screen height when expanded

type MobileBottomSheetProps = {
  children: ReactNode;
};

function MobileBottomSheet({ children }: MobileBottomSheetProps) {
  const [drawerHeight, setDrawerHeight] = useState(COLLAPSED_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startY.current = e.touches[0].clientY;
    startHeight.current = drawerHeight;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentY = e.touches[0].clientY;
    const deltaY = startY.current - currentY; // Positive when dragging up
    const newHeight = Math.max(
      COLLAPSED_HEIGHT,
      Math.min(
        window.innerHeight * (EXPANDED_HEIGHT_PERCENT / 100),
        startHeight.current + deltaY,
      ),
    );
    setDrawerHeight(newHeight);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // Snap to collapsed or expanded based on current height
    const expandedHeight = window.innerHeight * (EXPANDED_HEIGHT_PERCENT / 100);
    const threshold = (expandedHeight + COLLAPSED_HEIGHT) / 2;

    if (drawerHeight > threshold) {
      setDrawerHeight(expandedHeight);
    } else {
      setDrawerHeight(COLLAPSED_HEIGHT);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startHeight.current = drawerHeight;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentY = e.clientY;
      const deltaY = startY.current - currentY;
      const newHeight = Math.max(
        COLLAPSED_HEIGHT,
        Math.min(
          window.innerHeight * (EXPANDED_HEIGHT_PERCENT / 100),
          startHeight.current + deltaY,
        ),
      );
      setDrawerHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      const expandedHeight =
        window.innerHeight * (EXPANDED_HEIGHT_PERCENT / 100);
      const threshold = (expandedHeight + COLLAPSED_HEIGHT) / 2;

      if (drawerHeight > threshold) {
        setDrawerHeight(expandedHeight);
      } else {
        setDrawerHeight(COLLAPSED_HEIGHT);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, drawerHeight]);

  return (
    <div
      className="fixed right-0 left-0 z-20 flex flex-col rounded-t-2xl border-fancy-pants bg-white/95 shadow-2xl backdrop-blur-lg transition-all sm:hidden dark:bg-zinc-900/95"
      style={{
        bottom: `${BOTTOM_TAB_BAR_HEIGHT}px`,
        height: `${drawerHeight}px`,
        transition: isDragging ? 'none' : 'height 0.3s ease-out',
      }}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Drag to expand or collapse drawer"
        className="flex cursor-grab items-center justify-center py-3 active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={() => {
          const expandedHeight =
            window.innerHeight * (EXPANDED_HEIGHT_PERCENT / 100);
          setDrawerHeight(
            drawerHeight === COLLAPSED_HEIGHT
              ? expandedHeight
              : COLLAPSED_HEIGHT,
          );
        }}
      >
        <div className="h-1 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </button>

      {/* Drawer content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </div>
  );
}

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
  // Pane is max-w-sm (24rem = 384px) + 24px padding on each side + 24px spacing = 456px total
  // Sidebar collapsed: 56px (w-14), expanded: 200px (w-50)
  const sidebarWidth = sidebarCollapsed ? 56 : 200;
  const paneWidth = 456;
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

      {/* Desktop floating pane */}
      <div className="pointer-events-none absolute inset-0 hidden p-6 sm:block">
        <div className="pointer-events-auto h-full max-w-sm rounded-2xl border-fancy-pants bg-white/80 p-6 backdrop-blur-lg dark:bg-zinc-900/80">
          <h1 className="mb-4 font-bold text-2xl text-primary">
            Find Churches
          </h1>
          <p className="text-secondary">
            Explore churches and ministries in your area.
          </p>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <MobileBottomSheet>
        <h1 className="mb-4 font-bold text-2xl text-primary">Find Churches</h1>
        <p className="text-secondary">
          Explore churches and ministries in your area.
        </p>
      </MobileBottomSheet>
    </div>
  );
}
