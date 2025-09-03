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
import {
  IconDots,
  IconEye,
  IconSettings,
  IconUserMinus,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { hasValidSession } from '../-functions';
import classes from './-churches.module.css';


export const Route = createFileRoute('/dashboard_/churches')({
  component: ChurchesPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurches.queryOptions(),
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

function ChurchesPage() {
  const trpc = useTRPC();
  const { data: churches } = useSuspenseQuery(
    trpc.dashboard.churches.getChurches.queryOptions(),
  );

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>Churches</Title>
        <Button>Add Church</Button>
      </Group>

      <Stack gap="lg">
        <div>
          <Text fw={500} mb="xs">
            Church Management
          </Text>
          <Text size="sm" c="dimmed" mb="lg">
            Connect with and manage your church relationships. Join new
            communities and stay engaged with your existing church family.
          </Text>
        </div>

        <Text fw={500} size="lg">
          My Churches
        </Text>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {churches.map((church) => {
            const membership = church.memberships[0];
            const isAdmin = membership?.isAdmin ?? false;

            return (
              <Card
                key={church.id}
                shadow="xs"
                padding="lg"
                radius="md"
                withBorder
                className={classes.card}
              >
                <Group justify="space-between" mb="xs">
                  <Link
                    to="/dashboard/churches/$churchId"
                    params={{ churchId: church.id }}
                    className={classes.titleLink}
                  >
                    <Text fw={500} truncate>
                      {church.name}
                    </Text>
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
                        <Menu.Item leftSection={<IconEye size={14} />}>
                          View Details
                        </Menu.Item>
                        {isAdmin && (
                          <Menu.Item leftSection={<IconSettings size={14} />}>
                            Manage
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconUserMinus size={14} />}
                          color="red"
                        >
                          Leave Church
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed">
                  {church.description ||
                    (isAdmin
                      ? 'You have administrative access to this church.'
                      : 'You are a member of this church.')}
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </>
  );
}
