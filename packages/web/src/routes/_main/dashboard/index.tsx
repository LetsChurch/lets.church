import {
  IconBuildingChurch,
  IconBuildingCommunity,
  IconRadio,
  IconShieldLock,
  IconUserCircle,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import {
  DashboardLinkCard,
  DashboardPageHeader,
} from '@/components/dashboard/dashboard-ui';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/')({
  component: DashboardHome,
});

function DashboardHome() {
  const trpc = useTRPC();

  const { data: currentUser } = useSuspenseQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

  return (
    <>
      <DashboardPageHeader
        title="Dashboard"
        description="Manage your account, publishing channels, churches, and organizations."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardLinkCard
          to="/dashboard/account"
          title="Account"
          description="Profile, security, donations, and newsletter preferences."
          icon={<IconUserCircle size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/channels"
          title="Channels"
          description="Publish and maintain your sermons and media."
          icon={<IconRadio size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/churches"
          title="Churches"
          description="Browse churches and manage the ones you serve."
          icon={<IconBuildingChurch size={18} />}
        />
        <DashboardLinkCard
          to="/dashboard/organizations"
          title="Organizations"
          description="Review ministry profiles and associations."
          icon={<IconBuildingCommunity size={18} />}
        />
        {currentUser.role === 'ADMIN' ? (
          <DashboardLinkCard
            to="/dashboard/admin"
            title="Administration"
            description="Monitor queues, approvals, content, and system operations."
            icon={<IconShieldLock size={18} />}
          />
        ) : null}
      </div>
    </>
  );
}
