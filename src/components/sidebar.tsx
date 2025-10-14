import { Tooltip } from '@base-ui-components/react/tooltip';
import {
  IconArrowLeft,
  IconBookmark,
  IconBookmarks,
  IconBrandSafari,
  IconChevronDown,
  IconFlag,
  IconHeartFilled,
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  getInitialSidebarCollapsed,
  setSidebarCollapsed,
} from '@/stores/sidebar';
import { cn } from '@/util/cn';
import Logo from './logo';

type SidebarProps = {
  className?: string;
};

type Channel = {
  name: string;
  avatar?: string;
};

const mockChannels: Channel[] = [
  { name: 'Conversations That Matter' },
  { name: 'Alpha & Omega Ministries' },
  { name: "The Shepherd's Church" },
  { name: 'Ready4Eternity' },
  { name: 'The PRODCAST' },
];

export default function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed());
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAltMenu, setShowAltMenu] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  const toggleCollapsed = () => {
    const newValue = !collapsed;
    setCollapsed(newValue);
    setSidebarCollapsed(newValue);
    setShowAltMenu(false);
  };

  const openAltMenuFromCollapsed = () => {
    setShowAltMenu(true);
  };

  const closeAltMenu = () => {
    setShowAltMenu(false);
  };

  return (
    <div
      className={cn(
        'hidden h-full flex-col border-zinc-900 border-r bg-zinc-900/95 backdrop-blur-sm sm:flex',
        collapsed && !showAltMenu ? 'w-14' : 'w-50',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-zinc-900 border-b px-3',
          collapsed && !showAltMenu ? 'justify-center' : 'gap-[7px]',
        )}
      >
        {collapsed && !showAltMenu ? null : (
          <button
            type="button"
            onClick={showAltMenu ? closeAltMenu : () => setShowAltMenu(true)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/[0.15]"
          >
            {showAltMenu ? (
              <IconArrowLeft size={24} className="text-white" />
            ) : (
              <IconMenu2 size={24} className="text-white" />
            )}
          </button>
        )}
        {collapsed && !showAltMenu ? (
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={<Link to="/" />}
                onMouseEnter={() => setIsLogoHovered(true)}
                onMouseLeave={() => setIsLogoHovered(false)}
                className="cursor-pointer"
              >
                <div className="relative">
                  <div
                    className={cn(
                      'transition-opacity duration-200',
                      isLogoHovered ? 'opacity-0' : 'opacity-100',
                    )}
                  >
                    <Logo collapsed />
                  </div>
                  <button
                    type="button"
                    onClick={openAltMenuFromCollapsed}
                    className={cn(
                      'absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity duration-200',
                      isLogoHovered ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <IconMenu2 size={24} className="text-white" />
                  </button>
                </div>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner
                  side="right"
                  sideOffset={8}
                  className="z-50"
                >
                  <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                    Home
                    <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        ) : (
          <Link to="/">
            <Logo />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col border-zinc-900 border-t">
        {showAltMenu ? (
          <>
            {/* Alternative Menu */}
            <div className="flex flex-col gap-2 px-1 py-3">
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-sm text-white transition-colors hover:bg-white/10"
              >
                Our Mission
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-sm text-white transition-colors hover:bg-white/10"
              >
                The Dorean Principle
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-sm text-white transition-colors hover:bg-white/10"
              >
                Roadmap
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-sm text-white transition-colors hover:bg-white/10"
              >
                Request a Feature
              </Link>
              <div className="mx-2 my-2.5 h-px bg-zinc-900" />
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-white/70 text-xs transition-colors hover:bg-white/10"
              >
                Terms of Service
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-white/70 text-xs transition-colors hover:bg-white/10"
              >
                Privacy Policy
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-white/70 text-xs transition-colors hover:bg-white/10"
              >
                DMCA
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Explore */}
            <div className="py-2">
              {collapsed ? (
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      render={
                        <Link
                          to="/"
                          className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                          activeProps={{
                            className: 'text-white',
                          }}
                          inactiveProps={{
                            className: 'text-white/70',
                          }}
                        />
                      }
                    >
                      <IconBrandSafari size={24} />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                          Explore
                          <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                        </Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              ) : (
                <Link
                  to="/"
                  className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                  activeProps={{
                    className: 'text-white',
                  }}
                  inactiveProps={{
                    className: 'text-white/70',
                  }}
                >
                  <IconBrandSafari size={24} />
                  <span className="pb-0.5">Explore</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                </Link>
              )}
              <div className="mx-4 h-px bg-zinc-900" />
            </div>

            {/* Following */}
            <div className="py-2">
              {collapsed ? (
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      render={
                        <Link
                          to="/following"
                          className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/5"
                        />
                      }
                    >
                      <IconFlag size={24} className="text-white" />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                          Following
                          <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                        </Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              ) : (
                <Link
                  to="/following"
                  className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/5"
                >
                  <IconFlag size={24} className="text-white" />
                  <span className="pb-0.5">Following</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                </Link>
              )}

              {/* Channel list */}
              {collapsed ? null : (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  {mockChannels
                    .slice(0, showAllChannels ? undefined : 5)
                    .map((channel) => (
                      <div
                        key={channel.name}
                        className="flex items-center gap-2.5"
                      >
                        <div className="flex size-6 shrink-0 items-center justify-center">
                          <div className="size-5 overflow-hidden rounded-full bg-indigo-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white/70 text-xs">
                            {channel.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  <button
                    type="button"
                    onClick={() => setShowAllChannels(!showAllChannels)}
                    className="flex items-center gap-2.5 text-left transition-colors hover:text-white/80"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <IconChevronDown
                        size={16}
                        className={cn(
                          'text-zinc-400 transition-transform',
                          showAllChannels && 'rotate-180',
                        )}
                      />
                    </div>
                    <span className="font-normal text-xs text-zinc-400">
                      {showAllChannels ? 'Show Less' : 'Show More'}
                    </span>
                  </button>
                </div>
              )}
              {collapsed ? (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  {mockChannels.slice(0, 5).map((channel) => (
                    <Tooltip.Provider key={channel.name}>
                      <Tooltip.Root>
                        <Tooltip.Trigger className="flex size-6 shrink-0 items-center justify-center">
                          <div className="size-5 overflow-hidden rounded-full bg-indigo-500" />
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Positioner
                            side="right"
                            sideOffset={8}
                            className="z-50"
                          >
                            <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                              {channel.name}
                              <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                            </Tooltip.Popup>
                          </Tooltip.Positioner>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowAllChannels(!showAllChannels)}
                    className="flex items-center justify-center"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <IconChevronDown
                        size={16}
                        className={cn(
                          'text-zinc-400 transition-transform',
                          showAllChannels && 'rotate-180',
                        )}
                      />
                    </div>
                  </button>
                </div>
              ) : null}
              <div className="mx-4 h-px bg-zinc-900" />
            </div>

            {/* Library */}
            <div className="py-2">
              {collapsed ? (
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      render={
                        <Link
                          to="/"
                          className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                          activeProps={{
                            className: 'text-white',
                          }}
                          inactiveProps={{
                            className: 'text-white/70',
                          }}
                        />
                      }
                    >
                      <IconBookmark size={24} />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                          Library
                          <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                        </Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              ) : (
                <Link
                  to="/"
                  className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                  activeProps={{
                    className: 'text-white',
                  }}
                  inactiveProps={{
                    className: 'text-white/70',
                  }}
                >
                  <IconBookmark size={24} />
                  <span className="pb-0.5">Library</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                </Link>
              )}

              {/* Library sub-items */}
              {collapsed ? (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger
                        render={<Link to="/" />}
                        className="flex size-6 items-center justify-center"
                      >
                        <IconHistory size={16} className="text-zinc-400" />
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Positioner
                          side="right"
                          sideOffset={8}
                          className="z-50"
                        >
                          <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                            History
                            <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                          </Tooltip.Popup>
                        </Tooltip.Positioner>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger
                        render={<Link to="/" />}
                        className="flex size-6 items-center justify-center"
                      >
                        <IconBookmarks size={16} className="text-zinc-400" />
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Positioner
                          side="right"
                          sideOffset={8}
                          className="z-50"
                        >
                          <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                            Saved Content
                            <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                          </Tooltip.Popup>
                        </Tooltip.Positioner>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </div>
              ) : (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  <Link
                    to="/"
                    className="flex items-center gap-2.5 transition-colors hover:text-white/80"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <IconHistory size={16} className="text-zinc-400" />
                    </div>
                    <span className="font-normal text-xs text-zinc-400">
                      History
                    </span>
                  </Link>
                  <Link
                    to="/"
                    className="flex items-center gap-2.5 transition-colors hover:text-white/80"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <IconBookmarks size={16} className="text-zinc-400" />
                    </div>
                    <span className="font-normal text-xs text-zinc-400">
                      Saved Content
                    </span>
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Donate Card */}
      {collapsed || showAltMenu ? null : (
        <div className="animate-fade-in px-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-indigo-500 p-3">
            <div className="mb-3">
              <p className="text-center font-bold text-sm text-white leading-snug">
                Keep sharing good news without ads.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-full bg-white px-2.5 py-[6px] font-semibold text-indigo-500 text-xs transition-opacity hover:opacity-90"
              >
                Donate Now
              </button>
              <button
                type="button"
                className="rounded-full px-2.5 py-[6px] font-semibold text-white/80 text-xs transition-colors hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Menu Donate Card */}
      {collapsed || !showAltMenu ? null : (
        <div className="animate-fade-in px-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-indigo-500 p-3">
            <div className="mb-3">
              <p className="text-center font-bold text-sm text-white leading-snug">
                Keep sharing good news without ads.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-full bg-white px-2.5 py-[6px] font-semibold text-indigo-500 text-xs transition-opacity hover:opacity-90"
              >
                Donate Now
              </button>
              <button
                type="button"
                className="rounded-full px-2.5 py-[6px] font-semibold text-white/80 text-xs transition-colors hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Menu Legal Footer */}
      {collapsed || !showAltMenu ? null : (
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="font-normal text-[10px] text-zinc-500 leading-snug">
            Let's Church is in the public domain and is operated as a{' '}
            non-profit.{' '}
            <Link to="/" className="underline">
              Learn more
            </Link>
          </p>
        </div>
      )}

      {/* Donate Button (Collapsed) */}
      {collapsed && !showAltMenu ? (
        <div className="px-4">
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger
                className="flex size-6 cursor-pointer items-center justify-center text-indigo-500 transition-all hover:scale-110 hover:animate-pulse hover:text-indigo-400"
                aria-label="Donate"
              >
                <IconHeartFilled size={20} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner
                  side="right"
                  sideOffset={8}
                  className="z-50"
                >
                  <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                    Donate
                    <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      ) : null}

      {/* Collapse Button */}
      {showAltMenu ? null : (
        <div className="p-4">
          {collapsed ? (
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger
                  className="flex w-full items-center gap-2.5 transition-colors hover:text-white/80"
                  onClick={toggleCollapsed}
                >
                  <div className="flex size-6 items-center justify-center">
                    <IconLayoutSidebarLeftExpand
                      size={16}
                      className="text-zinc-400"
                    />
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner
                    side="right"
                    sideOffset={8}
                    className="z-50"
                  >
                    <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-white text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                      Expand Sidebar
                      <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex w-full items-center gap-2.5 transition-colors hover:text-white/80"
            >
              <div className="flex size-6 items-center justify-center">
                <IconLayoutSidebarLeftCollapse
                  size={16}
                  className="text-zinc-400"
                />
              </div>
              <span className="font-normal text-xs text-zinc-400">
                Collapse Sidebar
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
