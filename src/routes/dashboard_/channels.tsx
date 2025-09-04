import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import classes from './-channels.module.css';

export const Route = createFileRoute('/dashboard_/channels')({
  component: ChannelsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannels.queryOptions(),
    );
    return {
      data,
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

function ChannelsPage() {
  const { data: channels } = Route.useLoaderData();

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
                className={classes.card}
              >
                <Group justify="space-between" mb="xs">
                  <Link
                    to="/dashboard/channels/$channelId"
                    params={{ channelId: channel.id }}
                    className={classes.titleLink}
                  >
                    <Text fw={500}>{channel.name}</Text>
                  </Link>
                  <Group gap="xs">
                    <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                      {isAdmin ? 'Admin' : 'Member'}
                    </Badge>
                    <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={(e) => e.preventDefault()}
                        >
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEdit size={14} />}>
                          Edit
                        </Menu.Item>
                        {isAdmin && (
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                          >
                            Delete
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed">
                  {isAdmin
                    ? 'You have administrative access to this channel.'
                    : 'You are a member of this channel.'}
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </>
  );
}
