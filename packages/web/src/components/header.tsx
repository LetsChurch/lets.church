import { useStore } from '@nanostores/react';
import { IconMenu2, IconSearch, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
  showBlurredBackground?: boolean;
  searchVariant?: 'default' | 'light';
  mode?: 'full' | 'fab';
}>;

export default function Header({
  children,
  defaultSearchValue,
  searchPlaceholder,
  channelSlug,
  showBlurredBackground = true,
  searchVariant = 'default',
  mode = 'full',
}: HeaderProps) {
  const trpc = useTRPC();
  const hasSessionQuery = useQuery(trpc.common.hasValidSession.queryOptions());
  const profileQuery = useQuery({
    ...trpc.account.getProfile.queryOptions(),
    enabled: hasSessionQuery.data === true,
  });
  const currentUserQuery = useQuery({
    ...trpc.common.getCurrentUser.queryOptions(),
    enabled: hasSessionQuery.data === true,
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const backgroundImageUrl = useStore($headerBackgroundImage);

  const hasBackground = showBlurredBackground && Boolean(backgroundImageUrl);
  const hasSearch = Boolean(searchPlaceholder || channelSlug);

  // FAB mode - just render the floating button and mobile menu
  if (mode === 'fab') {
    return (
      <>
        {/* Floating Menu Button - Mobile Only */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="fixed top-4 left-4 z-40 flex size-10 items-center justify-center rounded-lg border-fancy-pants bg-white/90 text-primary shadow-lg backdrop-blur-sm transition-colors hover:bg-white sm:hidden dark:bg-zinc-900/90 dark:hover:bg-zinc-900"
        >
          <IconMenu2 />
        </button>

        <MobileMenu
          open={isMobileMenuOpen}
          onOpenChange={setIsMobileMenuOpen}
        />
      </>
    );
  }

  // Full mode - render the complete header
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
      <div className="relative flex h-(--header-height) items-center justify-between p-4">
        {/* Mobile Search Overlay - only visible on mobile when open */}
        <div
          className={
            isMobileSearchOpen
              ? 'flex w-full items-center gap-2 sm:hidden'
              : 'hidden'
          }
        >
          <div className="flex-1">
            <SearchBar
              defaultValue={defaultSearchValue}
              placeholder={searchPlaceholder}
              channelSlug={channelSlug}
              variant={searchVariant}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border-fancy-pants bg-white/15 text-primary transition-colors hover:bg-white/25"
          >
            <IconX />
          </button>
        </div>

        {/* Mobile Logo and Menu Button - hidden when mobile search is open, hidden on desktop */}
        <div
          className={
            isMobileSearchOpen ? 'hidden' : 'flex items-center gap-3 sm:hidden'
          }
        >
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex size-8 items-center justify-center rounded-lg border-fancy-pants bg-white/15 text-primary transition-colors hover:bg-white/25"
          >
            <IconMenu2 />
          </button>
          <Link to="/">
            <Logo />
          </Link>
        </div>

        {/* Desktop Search Bar - always visible on desktop */}
        <div className="hidden w-80 sm:block">
          <SearchBar
            defaultValue={defaultSearchValue}
            placeholder={searchPlaceholder}
            channelSlug={channelSlug}
            variant={searchVariant}
          />
        </div>

        {/* Right side: Mobile Search Button + Login/Avatar */}
        <div
          className={
            isMobileSearchOpen
              ? 'hidden sm:flex sm:items-center sm:gap-2'
              : 'flex items-center gap-2'
          }
        >
          {/* Mobile Search Button (only shown when search is available) */}
          {hasSearch ? (
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border-fancy-pants bg-white/15 text-primary transition-colors hover:bg-white/25 sm:hidden"
            >
              <IconSearch />
            </button>
          ) : null}
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
                    {currentUserQuery.data?.role === 'ADMIN' ? (
                      <MenuItemRouterLink to="/dashboard/admin">
                        Admin
                      </MenuItemRouterLink>
                    ) : null}
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
      <div className="isolate">{children}</div>

      <MobileMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
    </div>
  );
}
