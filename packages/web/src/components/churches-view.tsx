import { useQuery } from '@tanstack/react-query';
import { ClientOnly, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import type { ChurchComboboxProps } from '@/components/church-combobox';
import { ChurchCombobox } from '@/components/church-combobox';
import { ChurchMap } from '@/components/church-map';
import type { ParsedFilters } from '@/routes/_main/churches';
import {
  getInitialSidebarCollapsed,
  SIDEBAR_CHANGE_EVENT,
} from '@/stores/sidebar';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

const BOTTOM_TAB_BAR_HEIGHT = 64; // Height of bottom tab bar in pixels

export type ChurchesViewProps = {
  filters: ParsedFilters;
  onNavigate: ChurchComboboxProps['onNavigate'];
  openLinksInNewTab?: boolean;
  isEmbed?: boolean;
  hideOrganization?: boolean;
};

export function ChurchesView({
  filters,
  onNavigate,
  openLinksInNewTab = false,
  isEmbed = false,
  hideOrganization = false,
}: ChurchesViewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    isEmbed ? false : getInitialSidebarCollapsed(),
  );
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const trpc = useTRPC();

  // Fetch church data based on filters
  const { data: churchData } = useQuery(
    trpc.church.searchChurches.queryOptions({
      lon: filters.center[0],
      lat: filters.center[1],
      range: filters.range,
      organizationSlug: filters.organizationSlug ?? null,
      tags: filters.tags.length > 0 ? filters.tags : null,
      limit: 1000,
    }),
  );

  useEffect(() => {
    // Skip sidebar event listener for embed routes
    if (isEmbed) return;

    const handleSidebarChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(customEvent.detail.collapsed);
    };

    window.addEventListener(SIDEBAR_CHANGE_EVENT, handleSidebarChange);
    return () =>
      window.removeEventListener(SIDEBAR_CHANGE_EVENT, handleSidebarChange);
  }, [isEmbed]);

  useEffect(() => {
    // Use matchMedia to only update when crossing the mobile breakpoint
    const mediaQuery = window.matchMedia('(max-width: 639px)');

    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Set initial value
    handleMediaChange(mediaQuery);

    // Listen for changes (only fires when crossing the breakpoint)
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  // Calculate padding to offset the map center
  // Desktop: Pane is max-w-sm (24rem = 384px) + 24px padding on each side + 24px spacing = 456px total
  // Sidebar collapsed: 56px (w-14), expanded: 200px (w-50)
  // Mobile: Pane is 50vh at bottom, need to offset bottom
  // Embed: No sidebar, so sidebarWidth is 0
  const sidebarWidth = isEmbed ? 0 : sidebarCollapsed ? 56 : 200;
  const paneWidth = 456;
  const mapPadding = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    if (isMobile) {
      // 50vh for the pane height on mobile + bottom tab bar height (no tab bar in embed)
      return {
        left: 0,
        top: 0,
        right: 0,
        bottom:
          window.innerHeight * 0.5 + (isEmbed ? 0 : BOTTOM_TAB_BAR_HEIGHT),
      };
    }

    // Desktop padding
    return {
      left: paneWidth + sidebarWidth,
      top: 0,
      right: 0,
      bottom: 0,
    };
  }, [sidebarWidth, isMobile, isEmbed]);

  const pane = (
    <Pane
      churchData={churchData}
      filters={filters}
      onNavigate={onNavigate}
      openLinksInNewTab={openLinksInNewTab}
      isEmbed={isEmbed}
      hideOrganization={hideOrganization}
    />
  );

  return (
    <div
      className={cn('relative', isEmbed ? 'h-screen w-screen' : 'size-full')}
    >
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
        <ChurchMap
          padding={mapPadding}
          filters={filters}
          churchData={churchData}
          isEmbed={isEmbed}
        />
        {/* Floating pane - desktop left side, mobile bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 sm:inset-0 sm:p-6">
          <div
            className={cn(
              'pointer-events-auto h-[50vh] w-full overflow-hidden rounded-t-2xl border-fancy-pants bg-white/80 backdrop-blur-lg sm:h-full sm:max-w-sm sm:rounded-2xl',
              !isEmbed && 'dark:bg-zinc-900/80',
            )}
          >
            {pane}
          </div>
        </div>
      </ClientOnly>
    </div>
  );
}

type PaneProps = {
  churchData?: {
    items: Array<{
      id: string;
      name: string;
      slug: string;
      addresses: Array<{
        latitude: number | null;
        longitude: number | null;
        locality: string | null;
        region: string | null;
      }>;
    }>;
  };
  filters: ParsedFilters;
  onNavigate: ChurchComboboxProps['onNavigate'];
  openLinksInNewTab?: boolean;
  isEmbed?: boolean;
  hideOrganization?: boolean;
};

function Pane({
  churchData,
  filters,
  onNavigate,
  openLinksInNewTab = false,
  isEmbed = false,
  hideOrganization = false,
}: PaneProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div
        className={cn(
          'sticky top-0 z-10 bg-linear-to-b from-75% from-white p-6',
          !isEmbed && 'dark:from-zinc-900',
        )}
      >
        <ChurchCombobox
          filters={filters}
          onNavigate={onNavigate}
          hideOrganization={hideOrganization}
        />
      </div>

      <div className="px-6 pb-6">
        {churchData ? (
          churchData.items.length > 0 ? (
            <div className="space-y-3">
              {churchData.items.map((church) => {
                const address = church.addresses[0];
                const locationParts = [
                  address?.locality,
                  address?.region,
                ].filter(Boolean);
                const location = locationParts.join(', ');

                return (
                  <Link
                    key={church.id}
                    to="/churches/$slug"
                    params={{ slug: church.slug }}
                    target={openLinksInNewTab ? '_blank' : undefined}
                    rel={openLinksInNewTab ? 'noopener noreferrer' : undefined}
                    className={cn(
                      'block w-full rounded-lg border border-zinc-200 bg-white p-4 text-left transition-all hover:border-indigo-400 hover:shadow-md',
                      !isEmbed &&
                        'dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-white',
                    )}
                  >
                    <h3 className="font-semibold text-primary">
                      {church.name}
                    </h3>
                    {location ? (
                      <p
                        className={cn(
                          'mt-1 text-sm text-zinc-600',
                          !isEmbed && 'dark:text-zinc-400',
                        )}
                      >
                        {location}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p
                className={cn(
                  'font-medium text-zinc-700',
                  !isEmbed && 'dark:text-zinc-300',
                )}
              >
                No churches found
              </p>
              <p
                className={cn(
                  'mt-2 text-sm text-zinc-500',
                  !isEmbed && 'dark:text-zinc-400',
                )}
              >
                Try adjusting your search filters or location
              </p>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center py-12">
            <p
              className={cn('text-zinc-500', !isEmbed && 'dark:text-zinc-400')}
            >
              Loading...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
