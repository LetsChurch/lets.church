import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { Text } from '@/components/ui';
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link to="/dashboard/account" className="block">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text fw={500}>Account</Text>
          <Text size="sm" c="dimmed">
            Manage your account settings and profile
          </Text>
        </div>
      </Link>
      <Link to="/dashboard/channels" className="block">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text fw={500}>Channels</Text>
          <Text size="sm" c="dimmed">
            Create and manage your channels
          </Text>
        </div>
      </Link>
      <Link to="/dashboard/churches" className="block">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text fw={500}>Churches</Text>
          <Text size="sm" c="dimmed">
            Browse and connect with churches
          </Text>
        </div>
      </Link>
      <Link to="/dashboard/organizations" className="block">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <Text fw={500}>Organizations</Text>
          <Text size="sm" c="dimmed">
            Browse and connect with organizations
          </Text>
        </div>
      </Link>
      {currentUser.role === 'ADMIN' && (
        <Link to="/dashboard/admin" className="block">
          <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
            <Text fw={500}>Admin</Text>
            <Text size="sm" c="dimmed">
              Manage approvals and site administration
            </Text>
          </div>
        </Link>
      )}
    </div>
  );
}
