import { Box, Center, Stack, Text, Title } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import Logo from '@/components/logo';
import { useTRPC } from '@/trpc/react';
import { DEFAULT_MAINTENANCE_MESSAGE } from '@/util/maintenance-constants';
import { MantineWrapper, mantineStyles } from './-mantine';

export const Route = createFileRoute('/maintenance')({
  component: MaintenanceRoute,
  head: () => ({
    links: mantineStyles,
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
    <MantineWrapper>
      <Center mih="100vh" p="xl">
        <Stack align="center" gap="lg" maw={520} ta="center">
          <Box my="md" style={{ transform: 'scale(1.8)' }}>
            <Logo />
          </Box>
          <Title order={1}>We'll Be Right Back</Title>
          <Text c="dimmed" size="lg">
            {status.message ?? DEFAULT_MAINTENANCE_MESSAGE}
          </Text>
        </Stack>
      </Center>
    </MantineWrapper>
  );
}
