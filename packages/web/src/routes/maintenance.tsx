import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';

import Logo from '@/components/logo';
import { Text, Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/util/maintenance-constants';

export const Route = createFileRoute('/maintenance')({
  component: MaintenanceRoute,
  head: () => ({
    meta: [{ title: "Maintenance · Let's Church" }],
  }),
  beforeLoad: async ({ context: { queryClient, trpc } }) => {
    const status = await queryClient.fetchQuery(
      trpc.common.getMaintenanceStatus.queryOptions(),
    );
    // The maintenance page only exists while maintenance mode is on. Otherwise
    // send visitors to the home page.
    if (!status.enabled) {
      throw redirect({ to: '/' });
    }
  },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(
      trpc.common.getMaintenanceStatus.queryOptions(),
    ),
});

function MaintenanceRoute() {
  const trpc = useTRPC();
  const { data: status } = useSuspenseQuery(
    trpc.common.getMaintenanceStatus.queryOptions(),
  );

  return (
    <div className="bg-page flex min-h-screen items-center justify-center p-8">
      <div className="flex max-w-[520px] flex-col items-center gap-5 text-center">
        <div style={{ transform: 'scale(1.8)' }} className="my-4">
          <Logo />
        </div>
        <Title order={1}>We'll Be Right Back</Title>
        <Text c="dimmed" size="lg">
          {status.message ?? DEFAULT_MAINTENANCE_MESSAGE}
        </Text>
      </div>
    </div>
  );
}
