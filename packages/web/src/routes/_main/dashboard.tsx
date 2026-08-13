import {
  IconBuildingChurch,
  IconBuildingCommunity,
  IconHelp,
  IconHome,
  IconMenu2,
  IconRadio,
  IconShieldLock,
  IconUserCircle,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { useEffect } from 'react';

import { DashboardUserMenu } from '@/components/dashboard/dashboard-user-menu';
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
  { label: 'Overview', to: '/dashboard', icon: IconHome },
  { label: 'Account', to: '/dashboard/account', icon: IconUserCircle },
  { label: 'Channels', to: '/dashboard/channels', icon: IconRadio },
  { label: 'Churches', to: '/dashboard/churches', icon: IconBuildingChurch },
  {
    label: 'Organizations',
    to: '/dashboard/organizations',
    icon: IconBuildingCommunity,
  },
] as const;

function DashboardLayout() {
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure();
  const [helpOpened, { open: openHelp, close: closeHelp }] = useDisclosure();
  const location = useLocation();
  const trpc = useTRPC();
  const { data: currentUser } = useQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );
  const { data: profile } = useQuery({
    ...trpc.account.getProfile.queryOptions(),
    enabled: Boolean(currentUser),
  });

  useEffect(() => {
    closeNav();
  }, [closeNav, location.pathname]);

  const navItems = [
    ...NAV_ITEMS,
    ...(currentUser?.role === 'ADMIN'
      ? [
          {
            label: 'Admin',
            to: '/dashboard/admin' as const,
            icon: IconShieldLock,
          },
        ]
      : []),
  ];

  const isActive = (to: string) =>
    to === '/dashboard'
      ? location.pathname === '/dashboard' ||
        location.pathname === '/dashboard/'
      : location.pathname.startsWith(to);

  const navLinks = (
    <nav aria-label="Dashboard" className="flex flex-col gap-1">
      <div className="text-muted mb-2 px-3 font-mono text-[0.65rem] tracking-[0.16em] uppercase">
        Workspace
      </div>
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={closeNav}
            className={cn(
              'relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40',
              isActive(item.to)
                ? 'bg-dashboard-accent-soft text-brand before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand dark:text-white'
                : 'text-secondary hover:bg-dashboard-raised hover:text-dashboard-ink',
            )}
          >
            <Icon aria-hidden="true" size={17} stroke={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="bg-dashboard-canvas flex min-h-screen flex-col">
      <header className="border-dashboard-rule bg-dashboard-surface/90 sticky top-0 z-30 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b backdrop-blur md:grid-cols-[15rem_minmax(0,1fr)_auto]">
        <div className="border-dashboard-rule flex h-full items-center gap-2 px-3 md:border-r md:px-5">
          <button
            type="button"
            onClick={toggleNav}
            aria-label="Toggle navigation"
            aria-expanded={navOpened}
            className="text-secondary hover:bg-dashboard-accent-soft hover:text-dashboard-ink focus-visible:ring-brand/40 flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 md:hidden"
          >
            <IconMenu2 size={20} />
          </button>
          <Link
            to="/dashboard"
            className="dashboard-page-title text-dashboard-ink focus-visible:ring-brand/40 hidden min-w-0 truncate rounded-md text-lg outline-none focus-visible:ring-2 md:block"
          >
            Dashboard
          </Link>
        </div>

        <div className="flex min-w-0 items-center justify-center px-3 md:px-6">
          <div className="w-full max-w-xl">
            <DashboardSearchBar currentUser={currentUser} />
          </div>
        </div>

        <div className="border-dashboard-rule flex h-full items-center border-l px-3 md:px-5">
          <DashboardUserMenu
            profile={profile}
            isAdmin={currentUser?.role === 'ADMIN'}
          />
        </div>
      </header>

      <div className="relative flex flex-1">
        <aside
          className={cn(
            'fixed inset-x-0 top-16 z-20 h-[calc(100vh-4rem)] w-full flex-col overflow-y-auto border-dashboard-rule border-r bg-dashboard-surface p-4 shadow-xl md:sticky md:flex md:w-60 md:shadow-none',
            navOpened ? 'flex' : 'hidden',
          )}
        >
          <div className="flex-1">{navLinks}</div>
          <div className="border-dashboard-rule mt-auto border-t pt-4">
            <button
              type="button"
              onClick={openHelp}
              className="text-secondary hover:bg-dashboard-accent-soft hover:text-dashboard-ink focus-visible:ring-brand/40 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
            >
              <IconHelp size={17} stroke={1.8} />
              <span>Help</span>
            </button>
          </div>
        </aside>

        <main className="bg-dashboard-canvas min-w-0 flex-1 px-4 py-5 md:px-7 md:py-7 lg:px-10">
          <div className="mx-auto w-full max-w-[96rem]">
            <EmailVerificationBanner />
            <PendingInvitationsBanner />
            <div className="mb-4">
              <BackButton />
            </div>
            <div className="dashboard-content">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <HelpModal opened={helpOpened} onClose={closeHelp} />
    </div>
  );
}
