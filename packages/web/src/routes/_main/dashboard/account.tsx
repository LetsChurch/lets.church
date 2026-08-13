import {
  IconBell,
  IconCreditCard,
  IconLock,
  IconMail,
  IconUser,
  IconWritingSign,
} from '@tabler/icons-react';
import { createFileRoute, redirect } from '@tanstack/react-router';

import {
  DashboardLinkCard,
  DashboardPageHeader,
  DashboardPanel,
} from '@/components/dashboard/dashboard-ui';
import { Badge, Text } from '@/components/ui';

export const Route = createFileRoute('/_main/dashboard/account')({
  component: AccountPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'Dashboard',
      to: '/dashboard',
    },
  }),
});

function AccountPage() {
  return (
    <>
      <DashboardPageHeader
        eyebrow="Personal settings"
        title="Account"
        description="Manage your identity, security, giving history, and communication preferences."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardLinkCard
          to="/dashboard/account/profile"
          title="Profile information"
          description="Update your name, username, and profile image."
          icon={<IconUser size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/account/participation"
          title="Participation policies"
          description="Review the policies required to comment or create a channel."
          icon={<IconWritingSign size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/account/security"
          title="Password & security"
          description="Change your password and review account protection."
          icon={<IconLock size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/account/donations"
          title="Donations"
          description="View receipts, annual statements, and recurring gifts."
          icon={<IconCreditCard size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/account/newsletter"
          title="Newsletter subscription"
          description="Choose whether to receive the Let’s Church newsletter."
          icon={<IconMail size={18} />}
        />
        <DashboardPanel className="flex min-h-32 items-start gap-3.5">
          <span className="bg-dashboard-accent-soft text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
            <IconBell size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text fw={600} className="text-dashboard-ink">
                Notifications
              </Text>
              <Badge color="gray">Coming soon</Badge>
            </div>
            <Text size="sm" c="dimmed" className="mt-1">
              Choose which activity and publishing updates you receive.
            </Text>
          </div>
        </DashboardPanel>
      </div>
    </>
  );
}
