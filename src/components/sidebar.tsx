import {
  IconBookmark,
  IconBookmarks,
  IconBrandSafari,
  IconChevronDown,
  IconFlag,
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
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

const COOKIE_NAME = 'lc-sidebar-collapsed';

const getInitialSidebarCollapsed = createIsomorphicFn()
  .client(() => Boolean(JSON.parse(Cookies.get(COOKIE_NAME) ?? 'false')))
  .server(() => Boolean(JSON.parse(getCookie(COOKIE_NAME) ?? 'false')));

export default function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed());
  const [showAllChannels, setShowAllChannels] = useState(false);

  useEffect(() => {
    Cookies.set(COOKIE_NAME, JSON.stringify(collapsed));
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((c) => !c);
  };

  return (
    <div
      className={cn(
        'hidden h-full flex-col border-zinc-900 border-r bg-zinc-950/95 backdrop-blur-sm sm:flex',
        collapsed ? 'w-14' : 'w-50',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-zinc-900 border-b px-3',
          collapsed ? 'justify-center' : 'gap-[7px]',
        )}
      >
        {collapsed ? null : (
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm transition-colors hover:bg-white/[0.15]"
          >
            <IconMenu2 size={24} className="text-white" />
          </button>
        )}
        <Link to="/">{collapsed ? <Logo collapsed /> : <Logo />}</Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col border-zinc-900 border-t">
        {/* Explore */}
        <div className="py-2">
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
            {collapsed ? null : <span className="pb-0.5">Explore</span>}
            <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
          </Link>
          <div className="mx-4 h-px bg-zinc-900" />
        </div>

        {/* Following */}
        <div className="py-2">
          <Link
            to="/following"
            className="group relative flex items-center gap-2.5 px-4 py-2 font-medium text-sm transition-colors hover:bg-white/5"
            activeProps={{
              className: 'text-white',
            }}
            inactiveProps={{
              className: 'text-white/70',
            }}
          >
            <IconFlag size={24} />
            {collapsed ? null : <span className="pb-0.5">Following</span>}
            <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
          </Link>

          {/* Channel list */}
          {collapsed ? null : (
            <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
              {mockChannels
                .slice(0, showAllChannels ? undefined : 5)
                .map((channel) => (
                  <div key={channel.name} className="flex items-center gap-2.5">
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
                <div
                  key={channel.name}
                  className="flex size-6 shrink-0 items-center justify-center"
                >
                  <div className="size-5 overflow-hidden rounded-full bg-indigo-500" />
                </div>
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
            {collapsed ? null : <span className="pb-0.5">Library</span>}
            <div className="absolute top-0 right-0 h-full w-0.5 bg-indigo-500 opacity-0 shadow-[0px_2px_12px_0px_#6366f1] group-[.active]:opacity-100" />
          </Link>

          {/* Library sub-items */}
          {collapsed ? (
            <div className="mt-1 flex flex-col gap-2 px-4 pt-1 pb-2">
              <div className="flex size-6 items-center justify-center">
                <IconHistory size={16} className="text-zinc-400" />
              </div>
              <div className="flex size-6 items-center justify-center">
                <IconBookmarks size={16} className="text-zinc-400" />
              </div>
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
      </nav>

      {/* Donate Card */}
      {collapsed ? null : (
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

      {/* Collapse Button */}
      <div className="p-4">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex w-full items-center gap-2.5 transition-colors hover:text-white/80"
        >
          <div className="flex size-6 items-center justify-center">
            {collapsed ? (
              <IconLayoutSidebarLeftExpand
                size={16}
                className="text-zinc-400"
              />
            ) : (
              <IconLayoutSidebarLeftCollapse
                size={16}
                className="text-zinc-400"
              />
            )}
          </div>
          {collapsed ? null : (
            <span className="font-normal text-xs text-zinc-400">
              Collapse Sidebar
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
