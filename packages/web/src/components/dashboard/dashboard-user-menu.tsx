import { Avatar } from '@/components/avatar';
import { LcMenu, MenuItemRouterLink } from '@/components/lc-menu';

export type DashboardUserMenuProps = {
  profile?: {
    avatarUrl?: string | null;
    fullName?: string | null;
    username?: string | null;
  } | null;
  isAdmin?: boolean;
};

export function DashboardUserMenu({
  profile,
  isAdmin = false,
}: DashboardUserMenuProps) {
  const displayName = profile?.fullName || profile?.username || 'User';

  return (
    <LcMenu.Root>
      <LcMenu.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Open user menu"
            className="border-dashboard-rule focus-visible:ring-brand/40 bg-dashboard-surface hover:border-brand/60 focus-visible:ring-offset-dashboard-surface size-9 shrink-0 overflow-hidden rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Avatar
              src={profile?.avatarUrl}
              alt={displayName}
              className="size-full"
              fallbackClassName="text-xs"
            />
          </button>
        )}
      />
      <LcMenu.Portal>
        <LcMenu.Positioner side="bottom" align="end" sideOffset={8}>
          <LcMenu.Popup className="min-w-52 shadow-lg">
            <div className="border-dashboard-rule border-b px-3 py-2.5">
              <div className="text-dashboard-ink truncate text-sm font-semibold">
                {displayName}
              </div>
              {profile?.username && profile.username !== displayName ? (
                <div className="text-secondary truncate text-xs">
                  @{profile.username}
                </div>
              ) : null}
            </div>
            <div className="p-1">
              <MenuItemRouterLink to="/dashboard/account">
                Account Settings
              </MenuItemRouterLink>
              <MenuItemRouterLink to="/">Main Site</MenuItemRouterLink>
              {isAdmin ? (
                <MenuItemRouterLink to="/dashboard/admin">
                  Admin
                </MenuItemRouterLink>
              ) : null}
              <LcMenu.Separator />
              <LcMenu.Item
                render={(props) => (
                  <form
                    method="post"
                    action="/auth/logout"
                    className="contents"
                  >
                    <button
                      {...props}
                      type="submit"
                      className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm text-red-600 transition-colors outline-none hover:bg-red-50 focus:bg-red-50 data-[highlighted]:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40 dark:data-[highlighted]:bg-red-950/40"
                    >
                      Logout
                    </button>
                  </form>
                )}
              />
            </div>
          </LcMenu.Popup>
        </LcMenu.Positioner>
      </LcMenu.Portal>
    </LcMenu.Root>
  );
}
