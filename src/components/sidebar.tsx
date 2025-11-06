import { Avatar } from '@base-ui-components/react/avatar';
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
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import {
  getInitialDonateCardDismissed,
  setDonateCardDismissed,
} from '@/stores/donate-card';
import {
  getInitialSidebarCollapsed,
  setSidebarCollapsed,
} from '@/stores/sidebar';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import Logo from './logo';

type SidebarProps = {
  className?: string;
};

export default function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed());
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAltMenu, setShowAltMenu] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [donateCardDismissed, setDonateCardDismissedState] = useState(
    getInitialDonateCardDismissed(),
  );

  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();

  const { data: followedChannels } = useQuery({
    ...trpc.home.getFollowedChannels.queryOptions(),
    enabled: isLoggedIn,
  });

  const channels = followedChannels ?? [];
  const hasChannels = channels.length > 0;

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

  const handleDismissDonateCard = () => {
    setDonateCardDismissedState(true);
    setDonateCardDismissed(true);
  };

  return (
    <div
      className={cn(
        'hidden h-full flex-col border-sidebar border-r bg-sidebar backdrop-blur-sm sm:flex',
        collapsed && !showAltMenu ? 'w-14' : 'w-50',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-sidebar border-b px-3',
          collapsed && !showAltMenu ? 'justify-center' : 'gap-[7px]',
        )}
      >
        {collapsed && !showAltMenu ? null : (
          <button
            type="button"
            onClick={showAltMenu ? closeAltMenu : () => setShowAltMenu(true)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-black/[0.15]"
          >
            {showAltMenu ? (
              <IconArrowLeft size={24} className="text-primary" />
            ) : (
              <IconMenu2 size={24} className="text-primary" />
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
                    <IconMenu2 size={24} className="text-primary" />
                  </button>
                </div>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner
                  side="right"
                  sideOffset={8}
                  className="z-50"
                >
                  <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
              >
                Our Mission
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
              >
                The Dorean Principle
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
              >
                Roadmap
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
              >
                Request a Feature
              </Link>
              <div className="mx-2 my-2.5 h-px bg-zinc-900" />
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
              >
                Terms of Service
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
              >
                Privacy Policy
              </Link>
              <Link
                to="/"
                className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
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
                            className: 'text-primary',
                          }}
                          inactiveProps={{
                            className: 'text-primary/70',
                          }}
                        />
                      }
                    >
                      <IconBrandSafari size={24} />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                    className: 'text-primary',
                  }}
                  inactiveProps={{
                    className: 'text-primary/70',
                  }}
                >
                  <IconBrandSafari size={24} />
                  <span className="pb-0.5">Explore</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
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
                          className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-white/5"
                        />
                      }
                    >
                      <IconFlag size={24} className="text-primary" />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                  className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-white/5"
                >
                  <IconFlag size={24} className="text-primary" />
                  <span className="pb-0.5">Following</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                </Link>
              )}

              {/* Channel list */}
              {collapsed ? null : (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  {!isLoggedIn ? (
                    <Link
                      to="/auth/login"
                      className="text-left text-xs text-zinc-400 transition-colors hover:text-primary/80"
                    >
                      Sign in to see channels
                    </Link>
                  ) : !hasChannels ? (
                    <p className="text-left text-xs text-zinc-400">
                      No channels yet
                    </p>
                  ) : (
                    <>
                      {channels
                        .slice(0, showAllChannels ? undefined : 5)
                        .map((channel) => (
                          <Link
                            key={channel.id}
                            to="/channel/$slug"
                            params={{ slug: channel.slug }}
                            className="flex items-center gap-2.5 transition-colors hover:text-primary/80"
                          >
                            <div className="flex size-6 shrink-0 items-center justify-center">
                              <Avatar.Root className="size-5 overflow-hidden rounded-full border-top-highlight">
                                <Avatar.Image
                                  src={channel.avatarUrl || undefined}
                                  alt={channel.name}
                                  className="size-full object-cover"
                                />
                                <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-brand font-bold text-[10px] text-primary">
                                  {channel.name.charAt(0).toUpperCase()}
                                </Avatar.Fallback>
                              </Avatar.Root>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-primary/70 text-xs">
                                {channel.name}
                              </p>
                            </div>
                          </Link>
                        ))}
                      {channels.length > 5 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllChannels(!showAllChannels)}
                          className="flex items-center gap-2.5 text-left transition-colors hover:text-primary/80"
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
                      ) : null}
                    </>
                  )}
                </div>
              )}
              {collapsed ? (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  {!isLoggedIn || !hasChannels ? null : (
                    <>
                      {channels.slice(0, 5).map((channel) => (
                        <Tooltip.Provider key={channel.id}>
                          <Tooltip.Root>
                            <Tooltip.Trigger
                              render={
                                <Link
                                  to="/channel/$slug"
                                  params={{ slug: channel.slug }}
                                />
                              }
                              className="flex size-6 shrink-0 items-center justify-center"
                            >
                              <Avatar.Root className="size-5 overflow-hidden rounded-full border-top-highlight">
                                <Avatar.Image
                                  src={channel.avatarUrl || undefined}
                                  alt={channel.name}
                                  className="size-full object-cover"
                                />
                                <Avatar.Fallback className="flex size-full items-center justify-center rounded-full bg-brand font-bold text-[10px] text-primary">
                                  {channel.name.charAt(0).toUpperCase()}
                                </Avatar.Fallback>
                              </Avatar.Root>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Positioner
                                side="right"
                                sideOffset={8}
                                className="z-50"
                              >
                                <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                                  {channel.name}
                                  <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                                </Tooltip.Popup>
                              </Tooltip.Positioner>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      ))}
                      {channels.length > 5 ? (
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
                      ) : null}
                    </>
                  )}
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
                          to="/library"
                          className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                          activeProps={{
                            className: 'text-primary',
                          }}
                          inactiveProps={{
                            className: 'text-primary/70',
                          }}
                        />
                      }
                    >
                      <IconBookmark size={24} />
                      <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        side="right"
                        sideOffset={8}
                        className="z-50"
                      >
                        <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
                          Library
                          <Tooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]" />
                        </Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              ) : (
                <Link
                  to="/library"
                  className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                  activeProps={{
                    className: 'text-primary',
                  }}
                  inactiveProps={{
                    className: 'text-primary/70',
                  }}
                >
                  <IconBookmark size={24} />
                  <span className="pb-0.5">Library</span>
                  <div className="absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
                </Link>
              )}

              {/* Library sub-items */}
              {collapsed ? (
                <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger
                        render={<Link to="/history" />}
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
                          <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                        render={<Link to="/library" />}
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
                          <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                    to="/history"
                    className="flex items-center gap-2.5 transition-colors hover:text-primary/80"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <IconHistory size={16} className="text-zinc-400" />
                    </div>
                    <span className="font-normal text-xs text-zinc-400">
                      History
                    </span>
                  </Link>
                  <Link
                    to="/library"
                    className="flex items-center gap-2.5 transition-colors hover:text-primary/80"
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
      {collapsed || showAltMenu || donateCardDismissed ? null : (
        <div className="animate-fade-in px-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-brand p-3">
            <div className="mb-3">
              <p className="text-center font-bold text-sm text-white leading-snug">
                Keep sharing good news without ads.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <a
                href="https://givebutter.com/LetsChurch"
                className="rounded-full bg-white px-2.5 py-[6px] text-center font-semibold text-brand text-xs transition-opacity hover:opacity-90"
                target="_blank"
                rel="noopener"
              >
                Donate Now
              </a>
              <button
                type="button"
                onClick={handleDismissDonateCard}
                className="rounded-full px-2.5 py-[6px] font-semibold text-white/80 text-xs transition-colors hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Menu Donate Card */}
      {collapsed || !showAltMenu || donateCardDismissed ? null : (
        <div className="animate-fade-in px-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-brand p-3">
            <div className="mb-3">
              <p className="text-center font-bold text-primary text-sm leading-snug">
                Keep sharing good news without ads.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <a
                href="https://givebutter.com/LetsChurch"
                className="rounded-full bg-white px-2.5 py-[6px] text-center font-semibold text-brand text-xs transition-opacity hover:opacity-90"
                target="_blank"
                rel="noopener"
              >
                Donate Now
              </a>
              <button
                type="button"
                onClick={handleDismissDonateCard}
                className="rounded-full px-2.5 py-[6px] font-semibold text-primary/80 text-xs transition-colors hover:bg-white/10"
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
                className="flex size-6 cursor-pointer items-center justify-center text-brand transition-all hover:scale-110 hover:animate-pulse hover:text-indigo-400"
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
                  <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
                  className="flex w-full items-center gap-2.5 transition-colors hover:text-primary/80"
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
                    <Tooltip.Popup className="rounded-lg bg-zinc-900 px-2 py-1.5 font-semibold text-primary text-xs shadow-[0_20px_25px_-5px_rgba(0,0,0,0.9),0_8px_10px_-6px_rgba(0,0,0,0.9)]">
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
              className="flex w-full items-center gap-2.5 transition-colors hover:text-primary/80"
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
