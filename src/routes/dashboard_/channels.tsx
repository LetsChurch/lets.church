import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import db from '@/util/db';
import { hasValidSession, requireAuthMiddleware } from '../-functions';

const getChannels = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async ({ context }) => {
    invariant(context.session, 'Session not found');

    return db.channel.findMany({
      select: {
        id: true,
        name: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
          },
          where: {
            appUserId: context.session.appUser.id,
          },
        },
      },
      where: {
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
          },
        },
      },
    });
  });

const channelsQueryOptions = {
  queryKey: ['dashboard', 'channels'],
  queryFn: () => getChannels(),
} as const;

export const Route = createFileRoute('/dashboard_/channels')({
  component: ChannelsPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient } }) => {
    return queryClient.ensureQueryData(channelsQueryOptions);
  },
});

function ChannelsPage() {
  const { data: channels } = useSuspenseQuery(channelsQueryOptions);

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>My Channels</Title>
        <Button>Create Channel</Button>
      </Group>

      <Stack gap="lg">
        <div>
          <Text fw={500} mb="xs">
            Channel Management
          </Text>
          <Text size="sm" c="dimmed" mb="lg">
            Create and manage your content channels. Organize your media,
            sermons, and other content.
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {channels.map((channel) => {
            const { isAdmin } = channel.memberships[0];

            return (
              <Card
                key={channel.id}
                shadow="xs"
                padding="lg"
                radius="md"
                withBorder
              >
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>{channel.name}</Text>
                  <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                    {isAdmin ? 'Admin' : 'Member'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  {isAdmin
                    ? 'You have administrative access to this channel.'
                    : 'You are a member of this channel.'}
                </Text>
                <Group>
                  <Button variant="light" size="sm">
                    Edit
                  </Button>
                  {isAdmin && (
                    <Button variant="light" size="sm" color="red">
                      Delete
                    </Button>
                  )}
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </>
  );
}
