import { useStore } from '@nanostores/react';
import { IconMenu2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type PropsWithChildren, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { LcMenu, MenuItemRouterLink } from '@/components/lc-menu';
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
          <div className="absolute inset-0 bg-linear-to-b from-page/0 via-page/90 to-page" />
        </div>
      ) : null}

      {/* Theme gradient - uses ::after pseudo-element via CSS class */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-linear-to-b from-brand/40 to-transparent" />

      {/* Top Navigation Bar */}
      <div className="relative flex h-16 items-center justify-between p-4">
        {/* Mobile Logo and Menu Button (visible when sidebar is hidden) */}
        <div className="flex items-center gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex size-8 items-center justify-center rounded-lg border-fancy-pants bg-white/15 text-primary transition-colors hover:bg-white/25"
          >
            <IconMenu2 />
          </button>
          <Logo />
        </div>

        {/* Search Bar */}
        <div className="hidden w-80 sm:block">
          <SearchBar
            defaultValue={defaultSearchValue}
            placeholder={searchPlaceholder}
            channelSlug={channelSlug}
          />
        </div>

        {/* Login Button or User Avatar */}
        <div className="flex items-center gap-2">
          {hasSessionQuery.data && profileQuery.data ? (
            <LcMenu.Root>
              <LcMenu.Trigger
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className="size-8 shrink-0 overflow-hidden rounded-full bg-white"
                  >
                    <Avatar
                      src={profileQuery.data.avatarUrl || undefined}
                      alt={
                        profileQuery.data.fullName || profileQuery.data.username
                      }
                      fallbackText={(
                        profileQuery.data.fullName || profileQuery.data.username
                      )
                        .charAt(0)
                        .toUpperCase()}
                      className="size-full cursor-pointer"
                      fallbackClassName="bg-gray-200 text-gray-600 text-xs"
                    />
                  </button>
                )}
              />
              <LcMenu.Portal>
                <LcMenu.Positioner side="bottom" align="end">
                  <LcMenu.Popup className="mt-2 min-w-48 shadow-lg">
                    <MenuItemRouterLink to="/dashboard/account">
                      Account Settings
                    </MenuItemRouterLink>
                    <MenuItemRouterLink to="/dashboard">
                      Dashboard
                    </MenuItemRouterLink>
                    <LcMenu.Separator />
                    <LcMenu.Item
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
                            className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-red-400 text-sm transition-colors hover:bg-gray-100 focus:bg-gray-100 data-highlighted:bg-gray-100 dark:data-highlighted:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-800"
                          >
                            Logout
                          </button>
                        </form>
                      )}
                    />
                  </LcMenu.Popup>
                </LcMenu.Positioner>
              </LcMenu.Portal>
            </LcMenu.Root>
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
