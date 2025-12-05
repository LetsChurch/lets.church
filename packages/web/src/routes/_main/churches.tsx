import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { ChurchCombobox } from '@/components/church-combobox';
import { ChurchMap } from '@/components/church-map';
import {
  getInitialSidebarCollapsed,
  SIDEBAR_CHANGE_EVENT,
} from '@/stores/sidebar';

// Default coordinates for USA center
const MURICA: [number, number] = [-97.9222112121185, 39.3812661305678];
const DEFAULT_RANGE = '25000 mi';
const DEFAULT_NEARBY_RANGE = '100 mi';

// Search params schema for TanStack Router
const churchesSearchSchema = z.object({
  center: z.string().optional(),
  range: z.string().optional(),
  organization: z.string().optional(),
  tag: z.string().optional(),
});

export const Route = createFileRoute('/_main/churches')({
  validateSearch: (search) => churchesSearchSchema.parse(search),
  component: RouteComponent,
});

const BOTTOM_TAB_BAR_HEIGHT = 64; // Height of bottom tab bar in pixels
const COLLAPSED_HEIGHT = 80; // Height when drawer is collapsed
const EXPANDED_HEIGHT_PERCENT = 75; // Percentage of screen height when expanded

// Hook to parse location from search params
function useParsedLocation() {
  const search = Route.useSearch();

  return {
    range:
      search.range ?? (search.center ? DEFAULT_NEARBY_RANGE : DEFAULT_RANGE),
    center:
      (search.center
        ?.split(',')
        .map((v) => parseFloat(v))
        .slice(0, 2) as [number, number] | undefined) ?? MURICA,
  };
}

// Hook to parse organization from search params
function useParsedOrganization() {
  const search = Route.useSearch();

  return {
    organization: search.organization ?? null,
  };
}

// Hook to parse tags from search params
function useParsedTags() {
  const search = Route.useSearch();

  return {
    tags: search.tag?.split(',').filter(Boolean) ?? [],
  };
}

// Combined hook that returns all parsed filters
export function useParsedFilters() {
  const location = useParsedLocation();
  const organization = useParsedOrganization();
  const tags = useParsedTags();

  return {
    ...location,
    ...organization,
    ...tags,
  };
}

export type ParsedFilters = ReturnType<typeof useParsedFilters>;

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
  const filters = useParsedFilters();

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
  const mapPadding = useMemo(
    () => ({
      left: paneWidth + sidebarWidth,
      top: 0,
      right: 0,
      bottom: 0,
    }),
    [sidebarWidth],
  );

  const pane = <Pane />;

  return (
    <div className="relative size-full">
      <ClientOnly
        fallback={
          <div className="mx-auto mt-16 size-full max-w-2xl text-center">
            <h1 className="font-bold text-4xl text-primary tracking-tight sm:text-6xl">
              Loading
            </h1>
            <p className="mt-6 text-lg text-primary leading-8">
              "It is the glory of God to conceal a matter and the glory of kings
              to search it out."
              <br />- Proverbs 25:2 (BSB)
            </p>
          </div>
        }
      >
        <ChurchMap padding={mapPadding} filters={filters} />
        {/* Desktop floating pane */}
        <div className="pointer-events-none absolute inset-0 hidden p-6 sm:block">
          <div className="pointer-events-auto h-full max-w-sm rounded-2xl border-fancy-pants bg-white/80 p-6 backdrop-blur-lg dark:bg-zinc-900/80">
            {pane}
          </div>
        </div>

        {/* Mobile bottom sheet */}
        <MobileBottomSheet>{pane}</MobileBottomSheet>
      </ClientOnly>
    </div>
  );
}

function Pane() {
  return (
    <>
      <ChurchCombobox />
      <p className="text-secondary">
        Explore churches and ministries in your area.
      </p>
    </>
  );
}
