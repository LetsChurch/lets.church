import {
  Avatar,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconShield, IconUsers, IconVideo } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { StatCard } from './-components/stat-card';

export const Route = createFileRoute('/dashboard_/churches_/$churchId')({
  component: ChurchDetailsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchDetails.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: 'Churches',
        to: '/dashboard/churches',
      },
    };
  },
});

function ChurchDetailsPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchDetails.queryOptions({
      churchId,
    }),
  );

  const { userMembership } = church;
  const isAdmin = userMembership?.isAdmin ?? false;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <Avatar
            size="xl"
            src={church.avatarPath ? `/api/media/${church.avatarPath}` : null}
            alt={church.name}
          >
            {church.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>{church.name}</Title>
              <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                {isAdmin ? 'Admin' : 'Member'}
              </Badge>
            </Group>
            <Group gap="md" mb="sm">
              <Text c="dimmed">@{church.slug}</Text>
              <Text c="dimmed" size="sm">
                Founded {formatDate(church.createdAt)}
              </Text>
            </Group>
            {church.description && (
              <Text size="sm" maw={600}>
                {church.description}
              </Text>
            )}
          </div>
        </Group>
        <Group>{isAdmin && <Button variant="light">Edit Church</Button>}</Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        <StatCard
          title="Members"
          to="/dashboard/churches/$churchId/members"
          color="blue"
          icon={<IconUsers size={22} stroke={1.5} />}
          tooltip="Manage active members of this church organization"
          value={church._count.memberships}
        />

        <StatCard
          title="Channels"
          to="/dashboard/churches/$churchId/channels"
          color="green"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Manage associated content channels for this church"
          value={church._count.channelAssociations}
        />

        <StatCard
          title="Leaders"
          to="/dashboard/churches/$churchId/leaders"
          color="violet"
          icon={<IconShield size={22} stroke={1.5} />}
          tooltip="Manage registered leadership team members"
          value={church._count.leaders}
        />
      </SimpleGrid>
    </Stack>
  );
}
