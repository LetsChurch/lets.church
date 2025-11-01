import { Avatar } from '@base-ui-components/react/avatar';
import { Menu } from '@base-ui-components/react/menu';
import { useStore } from '@nanostores/react';
import { IconMenu2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type PropsWithChildren, useState } from 'react';
import { $headerBackgroundImage } from '@/stores/header';
import { useTRPC } from '@/trpc/react';
import LcLink from './lc-link';
import Logo from './logo';
import MobileMenu from './mobile-menu';
import SearchBar from './search-bar';

type HeaderProps = PropsWithChildren<{
  defaultSearchValue?: string;
  searchPlaceholder?: string;
  channelSlug?: string;
}>;

export default function Header({
  children,
  defaultSearchValue,
  searchPlaceholder,
  channelSlug,
}: HeaderProps) {
  const trpc = useTRPC();
  const hasSessionQuery = useQuery(trpc.common.hasValidSession.queryOptions());
  const profileQuery = useQuery({
    ...trpc.account.getProfile.queryOptions(),
    enabled: hasSessionQuery.data === true,
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const backgroundImageUrl = useStore($headerBackgroundImage);

  const hasBackground = Boolean(backgroundImageUrl);

  return (
    <div className="relative">
      {/* Background with gradient overlay - only show when there are children */}
      {hasBackground ? (
        <div className="-top-16 absolute inset-0 h-[244px]">
          <div className="absolute inset-0 bg-brand opacity-60">
            <div
              className="mask-[linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)] absolute inset-0 bg-center bg-cover blur-lg brightness-200 transition-all duration-1000 ease-in-out"
              style={{
                backgroundImage: `url('${backgroundImageUrl}')`,
              }}
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/90 to-bg" />
        </div>
      ) : null}

      {/* Theme gradient */}
      <div className="absolute inset-x-0 top-0 z-5 h-[240px] bg-gradient-to-b from-brand/40 to-transparent" />

      {/* Top Navigation Bar */}
      <div className="relative z-10 flex h-16 items-center justify-between p-4">
        {/* Mobile Logo and Menu Button (visible when sidebar is hidden) */}
        <div className="flex items-center gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex size-8 items-center justify-center rounded-lg border-top-highlight bg-white/15 text-primary transition-colors hover:bg-white/25"
          >
            <IconMenu2 />
          </button>
          <Logo />
        </div>

        {/* Search Bar */}
        <div className="w-80 max-sm:hidden">
          <SearchBar
            defaultValue={defaultSearchValue}
            placeholder={searchPlaceholder}
            channelSlug={channelSlug}
          />
        </div>

        {/* Login Button or User Avatar */}
        <div className="flex items-center gap-2">
          {hasSessionQuery.data && profileQuery.data ? (
            <Menu.Root>
              <Menu.Trigger
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className="size-8 flex-shrink-0 overflow-hidden rounded-full bg-white"
                  >
                    <Avatar.Root className="cursor-pointer">
                      <Avatar.Image
                        src={profileQuery.data.avatarUrl || undefined}
                        alt={
                          profileQuery.data.fullName ||
                          profileQuery.data.username
                        }
                        className="size-full object-cover"
                      />
                      <Avatar.Fallback className="flex size-full items-center justify-center bg-gray-200 text-gray-600 text-xs">
                        {(
                          profileQuery.data.fullName ||
                          profileQuery.data.username
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </Avatar.Fallback>
                    </Avatar.Root>
                  </button>
                )}
              />
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" className="z-10">
                  <Menu.Popup className="mt-2 min-w-48 rounded-lg border-top-highlight bg-zinc-900 p-1 shadow-lg">
                    <Menu.Item
                      render={(props) => (
                        <Link
                          {...props}
                          to="/dashboard/account"
                          className="flex w-full items-center rounded-md px-3 py-2 text-primary text-sm transition-colors hover:bg-zinc-800 focus:bg-zinc-800"
                        >
                          Account Settings
                        </Link>
                      )}
                    />
                    <Menu.Item
                      render={(props) => (
                        <Link
                          {...props}
                          to="/dashboard"
                          className="flex w-full items-center rounded-md px-3 py-2 text-primary text-sm transition-colors hover:bg-zinc-800 focus:bg-zinc-800"
                        >
                          Dashboard
                        </Link>
                      )}
                    />
                    <Menu.Separator className="my-1 h-px bg-zinc-800" />
                    <Menu.Item
                      render={(props) => (
                        // If this changes to something client side then make sure to invalidate the query for hasValidSession,
                        // or even all of react-query
                        <form
                          method="post"
                          action="/auth/logout"
                          className="contents"
                        >
                          <button
                            {...props}
                            type="submit"
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-red-400 text-sm transition-colors hover:bg-zinc-800 focus:bg-zinc-800"
                          >
                            Logout
                          </button>
                        </form>
                      )}
                    />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : (
            <LcLink to="/auth/login">Login</LcLink>
          )}
        </div>
      </div>

      {/* Children content (like carousel, for instance) */}
      {children}

      <MobileMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
    </div>
  );
}
