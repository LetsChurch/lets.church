import {
  IconArrowLeft,
  IconBookmark,
  IconBookmarks,
  IconBrandGithub,
  IconBrandGitlab,
  IconBuildingChurch,
  IconChevronDown,
  IconCompass,
  IconFlag,
  IconHeartFilled,
  IconHistory,
  IconInfoCircle,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar } from '@/components/avatar';
import { LcTooltip } from '@/components/lc-tooltip';
import { ThemeSwitcher } from '@/components/theme-switcher';
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

type SidebarDonateCardProps = {
  onDismiss?: () => void;
};

function SidebarDonateCard({ onDismiss }: SidebarDonateCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-brand p-3">
      <div className="mb-3">
        <p className="text-center font-bold text-sm text-white leading-snug">
          Keep sharing good news without ads.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <a
          href="https://givebutter.com/LetsChurch"
          className="rounded-full bg-white px-2.5 py-1.5 text-center font-semibold text-brand text-xs transition-opacity hover:opacity-90"
          target="_blank"
          rel="noopener"
        >
          Donate Now
        </a>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-2.5 py-1.5 font-semibold text-white/80 text-xs transition-colors hover:bg-white/10"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

type SidebarProps = {
  className?: string;
};

export default function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed());
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAltMenu, setShowAltMenu] = useState(false);
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
        'hidden h-full flex-col border-gray-100 border-r bg-white backdrop-blur-sm sm:flex dark:border-zinc-900 dark:bg-zinc-950',
        collapsed && !showAltMenu ? 'w-14' : 'w-50',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-(--header-height) items-center border-gray-100 border-b px-4 dark:border-zinc-900',
          collapsed && !showAltMenu ? 'justify-center' : 'gap-[7px]',
        )}
      >
        {collapsed && !showAltMenu ? null : showAltMenu ? (
          <button
            type="button"
            onClick={closeAltMenu}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-black/15"
          >
            <IconArrowLeft size={24} className="text-primary/80" />
          </button>
        ) : null}
        {collapsed && !showAltMenu ? (
          <Link to="/">
            <Logo collapsed />
          </Link>
        ) : (
          <Link to="/">
            <Logo />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col">
        <LcTooltip.Provider>
          {showAltMenu ? (
            <>
              {/* Alternative Menu */}
              <div className="flex flex-col gap-2 px-1 py-3">
                <Link
                  to="/about"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
                >
                  Our Mission
                </Link>
                <Link
                  to="/about/dorean"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
                >
                  The Dorean Principle
                </Link>
                <Link
                  to="/about/add-content"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
                >
                  How to Add Content
                </Link>
                <Link
                  to="/about/add-church"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10"
                >
                  How to Add Your Church
                </Link>
                {/* <Link */}
                {/*   to="/about/roadmap" */}
                {/*   className="rounded-lg px-2 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-white/10" */}
                {/* > */}
                {/*   Roadmap */}
                {/* </Link> */}
                <div className="mx-2 my-2.5 h-px bg-zinc-900" />
                <Link
                  to="/about/theology"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
                >
                  Statement of Theology
                </Link>
                <Link
                  to="/about/terms"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
                >
                  Terms of Service
                </Link>
                <Link
                  to="/about/privacy"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/about/dmca"
                  className="rounded-lg px-2 py-1.5 font-medium text-primary/70 text-xs transition-colors hover:bg-white/10"
                >
                  DMCA
                </Link>
                <div className="mt-2.5 flex gap-1.5 px-2 py-1.5">
                  <LcTooltip content="GitLab">
                    <a
                      href="https://gitlab.com/LetsChurch/lets.church"
                      target="_blank"
                      rel="noopener"
                      className="text-primary/50 transition-colors hover:text-primary/80"
                    >
                      <IconBrandGitlab size={16} />
                    </a>
                  </LcTooltip>
                  <LcTooltip content="GitHub">
                    <a
                      href="https://github.com/LetsChurch/lets.church"
                      target="_blank"
                      rel="noopener"
                      className="text-primary/50 transition-colors hover:text-primary/80"
                    >
                      <IconBrandGithub size={16} />
                    </a>
                  </LcTooltip>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Explore */}
              <div className="py-2">
                {collapsed ? (
                  <LcTooltip
                    content="Explore"
                    side="right"
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
                    <IconCompass size={24} />
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </LcTooltip>
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
                    <IconCompass size={24} />
                    <span className="pb-0.5">Explore</span>
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </Link>
                )}
                <hr className="mx-4 h-px border-gray-100 dark:border-zinc-900" />
              </div>

              {/* Following */}
              <div className="py-2">
                {collapsed ? (
                  <LcTooltip
                    content="Following"
                    side="right"
                    render={
                      <Link
                        to="/following"
                        className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-primary/70 text-sm transition-colors hover:bg-white/5"
                      />
                    }
                  >
                    <IconFlag size={24} className="text-primary/70" />
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </LcTooltip>
                ) : (
                  <Link
                    to="/following"
                    className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-primary/70 text-sm transition-colors hover:bg-white/5"
                  >
                    <IconFlag size={24} className="text-primary/70" />
                    <span className="pb-0.5">Following</span>
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </Link>
                )}

                {/* Channel list */}
                {collapsed ? null : (
                  <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                    {!isLoggedIn ? (
                      <Link
                        to="/auth/login"
                        className="text-left text-gray-600 text-xs dark:text-gray-400"
                      >
                        Sign in to see channels
                      </Link>
                    ) : !hasChannels ? (
                      <p className="text-left text-gray-600 text-xs dark:text-gray-400">
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
                                <Avatar
                                  src={channel.avatarUrl || undefined}
                                  alt={channel.name}
                                  className="size-5 border-fancy-pants"
                                  fallbackClassName="text-[10px]"
                                />
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
                                  'text-gray-600 transition-transform dark:text-gray-400',
                                  showAllChannels && 'rotate-180',
                                )}
                              />
                            </div>
                            <span className="font-normal text-gray-600 text-xs dark:text-gray-400">
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
                          <LcTooltip
                            key={channel.id}
                            content={channel.name}
                            side="right"
                            render={
                              <Link
                                to="/channel/$slug"
                                params={{ slug: channel.slug }}
                              />
                            }
                          >
                            <div className="flex size-6 shrink-0 items-center justify-center">
                              <Avatar
                                src={channel.avatarUrl || undefined}
                                alt={channel.name}
                                className="size-5 border-fancy-pants"
                                fallbackClassName="text-[10px]"
                              />
                            </div>
                          </LcTooltip>
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
                                  'text-gray-600 transition-transform dark:text-gray-400',
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
                <hr className="mx-4 h-px border-gray-100 dark:border-zinc-900" />
              </div>

              {/* Churches, Channels, and Library */}
              <div className="py-2">
                {collapsed ? (
                  <LcTooltip
                    content="Churches"
                    side="right"
                    render={
                      <Link
                        to="/churches"
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
                    <IconBuildingChurch size={24} />
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </LcTooltip>
                ) : (
                  <Link
                    to="/churches"
                    className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                    activeProps={{
                      className: 'text-primary',
                    }}
                    inactiveProps={{
                      className: 'text-primary/70',
                    }}
                  >
                    <IconBuildingChurch size={24} />
                    <span className="pb-0.5">Churches</span>
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </Link>
                )}
                {collapsed ? (
                  <LcTooltip
                    content="Channels"
                    side="right"
                    render={
                      <Link
                        to="/channels"
                        search={{ sort: 'subscribers' }}
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
                    <IconUsers size={24} />
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </LcTooltip>
                ) : (
                  <Link
                    to="/channels"
                    search={{ sort: 'subscribers' }}
                    className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
                    activeProps={{
                      className: 'text-primary',
                    }}
                    inactiveProps={{
                      className: 'text-primary/70',
                    }}
                  >
                    <IconUsers size={24} />
                    <span className="pb-0.5">Channels</span>
                    <div className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100" />
                  </Link>
                )}
                {collapsed ? (
                  <LcTooltip
                    content="Library"
                    side="right"
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
                    <div
                      role="presentation"
                      className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100"
                    />
                  </LcTooltip>
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
                    <div
                      role="presentation"
                      className="glow-md absolute top-0 right-0 h-full w-0.5 bg-brand opacity-0 group-[.active]:opacity-100"
                    />
                  </Link>
                )}

                {/* Library sub-items */}
                {collapsed ? (
                  <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                    <LcTooltip
                      content="History"
                      side="right"
                      render={<Link to="/history" />}
                    >
                      <div className="flex size-6 items-center justify-center">
                        <IconHistory size={16} className="text-primary/70" />
                      </div>
                    </LcTooltip>
                    <LcTooltip
                      content="Saved Content"
                      side="right"
                      render={<Link to="/library" />}
                    >
                      <div className="flex size-6 items-center justify-center">
                        <IconBookmarks size={16} className="text-primary/70" />
                      </div>
                    </LcTooltip>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
                    <Link
                      to="/history"
                      className="flex items-center gap-2.5 transition-colors hover:text-primary/80"
                    >
                      <div className="flex size-6 items-center justify-center">
                        <IconHistory size={16} className="text-primary/70" />
                      </div>
                      <span className="font-normal text-gray-600 text-xs dark:text-gray-400">
                        History
                      </span>
                    </Link>
                    <Link
                      to="/library"
                      className="flex items-center gap-2.5 transition-colors hover:text-primary/80"
                    >
                      <div className="flex size-6 items-center justify-center">
                        <IconBookmarks size={16} className="text-primary/70" />
                      </div>
                      <span className="font-normal text-gray-600 text-xs dark:text-gray-400">
                        Saved Content
                      </span>
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </LcTooltip.Provider>
      </nav>

      {/* Donate Card */}
      {collapsed || showAltMenu || donateCardDismissed ? null : (
        <div className="mb-4 animate-fade-in px-4">
          <SidebarDonateCard onDismiss={handleDismissDonateCard} />
        </div>
      )}

      {/* Alternative Menu Donate Card */}
      {collapsed || !showAltMenu || donateCardDismissed ? null : (
        <div className="animate-fade-in px-4">
          <SidebarDonateCard onDismiss={handleDismissDonateCard} />
        </div>
      )}

      {/* Alternative Menu Legal Footer */}
      {collapsed || !showAltMenu ? null : (
        <div className="flex flex-col gap-2 px-4 py-4">
          <p className="font-normal text-[10px] text-zinc-500 leading-snug">
            Let's Church is in the public domain and is operated as a{' '}
            non-profit.{' '}
            <Link to="/about" className="underline">
              Learn more
            </Link>
          </p>
        </div>
      )}

      <LcTooltip.Provider>
        {/* Donate Button (Collapsed) */}
        {collapsed && !showAltMenu ? (
          <div className="px-4 pb-3">
            <LcTooltip content="Donate" side="right">
              <a
                className="flex size-6 cursor-pointer items-center justify-center text-brand transition-all hover:scale-110 hover:animate-pulse hover:text-indigo-400"
                href="https://givebutter.com/LetsChurch"
                target="_blank"
                rel="noopener"
              >
                <IconHeartFilled size={20} />
              </a>
            </LcTooltip>
          </div>
        ) : null}

        {/* About Menu Button (Collapsed) */}
        {collapsed && !showAltMenu ? (
          <div className="px-4 pb-3">
            <LcTooltip content="About Let's Church" side="right">
              <button
                type="button"
                onClick={openAltMenuFromCollapsed}
                className="flex size-6 cursor-pointer items-center justify-center transition-colors hover:text-primary/80"
              >
                <IconInfoCircle
                  size={16}
                  className="text-gray-600 dark:text-gray-400"
                />
              </button>
            </LcTooltip>
          </div>
        ) : null}

        {/* About Link, Theme Switcher, and Collapse Button */}
        {showAltMenu ? null : (
          <div className="space-y-3 px-4 pb-4">
            {collapsed ? null : (
              <button
                type="button"
                onClick={() => setShowAltMenu(true)}
                className="flex w-full cursor-pointer items-center gap-2.5 transition-colors hover:text-primary/80"
              >
                <div className="flex size-6 items-center justify-center">
                  <IconInfoCircle
                    size={16}
                    className="text-gray-600 dark:text-gray-400"
                  />
                </div>
                <span className="font-normal text-gray-600 text-xs dark:text-gray-400">
                  About Let's Church
                </span>
              </button>
            )}
            {collapsed ? (
              <div className="flex size-6 items-center justify-center">
                <ThemeSwitcher collapsed={collapsed && !showAltMenu} />
              </div>
            ) : (
              <ThemeSwitcher collapsed={collapsed && !showAltMenu} />
            )}
            {collapsed ? (
              <LcTooltip content="Expand Sidebar" side="right">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2.5 transition-colors hover:text-primary/80"
                  onClick={toggleCollapsed}
                >
                  <div className="flex size-6 items-center justify-center">
                    <IconLayoutSidebarLeftExpand
                      size={16}
                      className="text-gray-600 dark:text-gray-400"
                    />
                  </div>
                </button>
              </LcTooltip>
            ) : (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex w-full cursor-pointer items-center gap-2.5 transition-colors hover:text-primary/80"
              >
                <div className="flex size-6 items-center justify-center">
                  <IconLayoutSidebarLeftCollapse
                    size={16}
                    className="text-gray-600 dark:text-gray-400"
                  />
                </div>
                <span className="font-normal text-gray-600 text-xs dark:text-gray-400">
                  Collapse Sidebar
                </span>
              </button>
            )}
          </div>
        )}
      </LcTooltip.Provider>
    </div>
  );
}
