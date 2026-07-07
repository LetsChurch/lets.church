import { IconHelp, IconMenu2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';

import EmailVerificationBanner from '@/components/email-verification-banner';
import PendingInvitationsBanner from '@/components/pending-invitations-banner';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { BackButton } from '@/util/back-navigation';
import { cn } from '@/util/cn';

import { HelpModal } from './dashboard/-components/help-modal';
import { DashboardSearchBar } from './dashboard/-components/search-bar';

export const Route = createFileRoute('/_main/dashboard')({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  component: DashboardLayout,
});

const NAV_ITEMS = [
  { label: 'Account', to: '/dashboard/account' },
  { label: 'Channels', to: '/dashboard/channels' },
  { label: 'Churches', to: '/dashboard/churches' },
  { label: 'Organizations', to: '/dashboard/organizations' },
] as const;

function DashboardLayout() {
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure();
  const [helpOpened, { open: openHelp, close: closeHelp }] = useDisclosure();
  const location = useLocation();
  const trpc = useTRPC();
  const { data: currentUser } = useQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

  const navItems = [
    ...NAV_ITEMS,
    ...(currentUser?.role === 'ADMIN'
      ? [{ label: 'Admin', to: '/dashboard/admin' as const }]
      : []),
  ];

  const isActive = (to: string) => location.pathname.startsWith(to);

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={closeNav}
          className={cn(
            'rounded-lg px-3 py-2 font-medium text-sm transition-colors',
            isActive(item.to)
              ? 'bg-brand/10 text-brand dark:text-indigo-300'
              : 'text-secondary hover:bg-gray-950/5 hover:text-primary dark:hover:bg-white/5',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="bg-page flex min-h-screen flex-col">
      {/* Header */}
      <header className="bg-page/80 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-4 backdrop-blur dark:border-zinc-900">
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Toggle navigation"
          className="text-secondary hover:text-primary flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-950/5 md:hidden dark:hover:bg-white/5"
        >
          <IconMenu2 size={20} />
        </button>

        <div className="mx-auto w-full max-w-100">
          <DashboardSearchBar currentUser={currentUser} />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-60 shrink-0 flex-col border-gray-100 border-r p-4 md:flex dark:border-zinc-900',
            navOpened ? 'flex' : 'hidden',
          )}
        >
          <div className="flex-1">{navLinks}</div>
          <div className="mt-auto border-t border-gray-100 pt-4 dark:border-zinc-900">
            <button
              type="button"
              onClick={openHelp}
              className="text-secondary hover:text-primary flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-950/5 dark:hover:bg-white/5"
            >
              <IconHelp size={16} />
              <span>Help</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <EmailVerificationBanner />
          <PendingInvitationsBanner />
          <div className="mb-4">
            <BackButton />
          </div>
          <Outlet />
        </main>
      </div>

      <HelpModal opened={helpOpened} onClose={closeHelp} />
    </div>
  );
}
