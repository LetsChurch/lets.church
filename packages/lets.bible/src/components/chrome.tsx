import { Menu } from '@base-ui/react/menu';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';

import { DEFAULT_BOOK, DEFAULT_CHAPTER } from '@/lib/canon';
import { clearLocalData } from '@/local/sync';
import { useTRPC } from '@/trpc/react';

import { Avatar } from './avatar';
import { Logo } from './logo';

// Home link with the full wordmark. (The collapsed icon variant exists on
// `Logo` but we're not using it in the header yet.)
export function HomeLogoLink() {
  return (
    <Link to="/" aria-label="lets.bible home" className="flex items-center">
      <Logo className="text-ink-strong h-[18px]" />
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
      <Menu.Trigger className="focus-visible:ring-gold/40 rounded-full outline-none focus-visible:ring-2">
        <Avatar name={name} className="size-8" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-30">
          <Menu.Popup className="border-line-strong bg-paper-raised min-w-[200px] rounded-xl border p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
            <div className="text-muted-2 truncate px-3 py-2 text-[12.5px]">
              {name}
            </div>
            <Menu.Separator className="bg-line my-1 h-px" />
            <Menu.Item
              render={(props) => (
                <Link
                  {...props}
                  to="/library"
                  className="text-ink data-highlighted:bg-paper-soft block cursor-pointer rounded-md px-3 py-2 text-[14px] outline-none"
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
                  className="text-ink data-highlighted:bg-paper-soft block cursor-pointer rounded-md px-3 py-2 text-[14px] outline-none"
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
                  className="text-ink data-highlighted:bg-paper-soft block cursor-pointer rounded-md px-3 py-2 text-[14px] outline-none"
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

  // Anonymous: the library is still theirs (saved on-device — highlights, notes,
  // offline commentary downloads), so it needs a header entry point of its own —
  // signed-in users reach it via the account menu above. /login is a server
  // route (302), so it's a plain anchor. (About lives in the footer only.)
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        to="/library"
        className="text-muted hover:text-ink text-sm font-semibold"
      >
        Library
      </Link>
      <a
        href="/login"
        className="border-line-strong bg-paper-raised text-ink rounded-[9px] border px-[15px] py-2 text-sm font-semibold"
      >
        Sign in
      </a>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="border-line/70 bg-paper/80 sticky top-0 z-30 flex h-[62px] flex-shrink-0 items-center gap-4 border-b px-4 backdrop-blur-sm sm:px-7">
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
    <footer className="text-faint flex flex-shrink-0 flex-wrap items-center justify-center gap-[18px] p-6 text-[12.5px]">
      <a href={authHost ?? undefined}>Powered by lets.church</a>
      <Dot />
      <Link to="/about">About</Link>
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

// The site-wide 404 — wired as the router's `defaultNotFoundComponent`, so a
// mistyped URL, an out-of-range chapter, or any `notFound()` thrown in a loader
// lands on a branded page (full chrome + a way back) instead of TanStack
// Router's bare "<p>Not Found</p>" default.
export function NotFound() {
  return (
    <PageShell>
      <div className="mx-auto flex max-w-[560px] flex-col items-center px-6 py-24 text-center sm:py-32">
        <div className="text-gold-soft text-[11px] font-bold tracking-[0.16em] uppercase">
          Not found
        </div>
        <h1 className="text-ink-strong mt-3 font-serif text-[34px] leading-[1.15] sm:text-[40px]">
          We couldn’t find that page
        </h1>
        <p className="text-muted mt-4 max-w-[440px] text-[15px] leading-relaxed">
          The page or passage you’re looking for doesn’t exist. Check the
          reference, or head back to start reading.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="bg-ink-strong dark:text-paper inline-block rounded-[9px] px-4 py-[10px] text-[14px] font-semibold text-white"
          >
            Go home
          </Link>
          <Link
            to="/bible/$book/$chapter"
            params={{ book: DEFAULT_BOOK, chapter: String(DEFAULT_CHAPTER) }}
            className="border-line-strong bg-paper-raised text-ink inline-block rounded-[9px] border px-4 py-[10px] text-[14px] font-semibold"
          >
            Start reading
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

// Re-exported so app pages can keep importing it from `@/components/chrome`.
// It lives in its own (tRPC-free) module so Storybook can render it in isolation.
export { ComingSoon } from './coming-soon';
