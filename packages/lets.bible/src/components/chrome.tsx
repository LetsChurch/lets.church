import { Menu } from '@base-ui/react/menu';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import { clearLocalData } from '@/local/sync';
import { useTRPC } from '@/trpc/react';
import { Avatar } from './avatar';
import { Logo } from './logo';

// Home link with the full wordmark. (The collapsed icon variant exists on
// `Logo` but we're not using it in the header yet.)
export function HomeLogoLink() {
  return (
    <Link to="/" aria-label="lets.bible home" className="flex items-center">
      <Logo className="h-[18px] text-ink-strong" />
    </Link>
  );
}

export function useAuth() {
  const trpc = useTRPC();
  const { data: signedIn } = useQuery(
    trpc.common.hasValidSession.queryOptions(),
  );
  const { data: me } = useQuery(trpc.common.me.queryOptions());
  return { signedIn: Boolean(signedIn), me: me ?? null };
}

// The signed-in account menu. The trigger is the avatar; "Log out" is a plain
// anchor (full navigation) because /logout is a server route that issues a 302.
function AccountMenu({ name }: { name: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
        <Avatar name={name} className="size-8" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-30">
          <Menu.Popup className="min-w-[200px] rounded-xl border border-line-strong bg-paper-raised p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
            <div className="truncate px-3 py-2 text-[12.5px] text-muted-2">
              {name}
            </div>
            <Menu.Separator className="my-1 h-px bg-line" />
            <Menu.Item
              render={(props) => (
                <Link
                  {...props}
                  to="/library"
                  className="block cursor-pointer rounded-md px-3 py-2 text-[14px] text-ink outline-none data-highlighted:bg-paper-soft"
                >
                  Your library
                </Link>
              )}
            />
            <Menu.Item
              render={(props) => (
                <Link
                  {...props}
                  to="/settings"
                  className="block cursor-pointer rounded-md px-3 py-2 text-[14px] text-ink outline-none data-highlighted:bg-paper-soft"
                >
                  Settings
                </Link>
              )}
            />
            <Menu.Item
              render={(props) => (
                <a
                  {...props}
                  href="/logout"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    props.onClick?.(e);
                    // Belt-and-suspenders: wipe on-device data on explicit
                    // logout before the navigation. The load-based detection in
                    // LocalSync still covers session expiry / other sign-outs.
                    clearLocalData();
                  }}
                  className="block cursor-pointer rounded-md px-3 py-2 text-[14px] text-ink outline-none data-highlighted:bg-paper-soft"
                >
                  Log out
                </a>
              )}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AuthActions() {
  const { signedIn, me } = useAuth();

  if (signedIn) {
    return (
      <AccountMenu name={me?.name ?? me?.preferredUsername ?? 'Account'} />
    );
  }

  // /login is a server route (302), so it's a plain anchor. (About lives in the
  // footer only — no header link.)
  return (
    <a
      href="/login"
      className="rounded-[9px] border border-line-strong bg-paper-raised px-[15px] py-2 font-semibold text-ink text-sm"
    >
      Sign in
    </a>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-[62px] flex-shrink-0 items-center gap-4 border-line/70 border-b bg-paper/80 px-4 backdrop-blur-sm sm:px-7">
      <HomeLogoLink />
      <span className="flex-1" />
      <AuthActions />
    </header>
  );
}

function Dot() {
  return <span className="text-line-strong">·</span>;
}

export function Footer() {
  const trpc = useTRPC();
  const { data: authHost } = useQuery(trpc.common.authHost.queryOptions());
  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-center gap-[18px] p-6 text-[12.5px] text-faint">
      <span>Ad-free</span>
      <Dot />
      <Link to="/about">About</Link>
      <Dot />
      <a href={authHost ?? undefined}>lets.church</a>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

// Re-exported so app pages can keep importing it from `@/components/chrome`.
// It lives in its own (tRPC-free) module so Storybook can render it in isolation.
export { ComingSoon } from './coming-soon';
