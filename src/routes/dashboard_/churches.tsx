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
import { OrganizationType } from '@prisma/client';
import {
  IconDots,
  IconEye,
  IconSettings,
  IconUserMinus,
} from '@tabler/icons-react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import db from '@/util/db';
import { hasValidSession, requireAuthMiddleware } from '../-functions';
import classes from './-churches.module.css';

const getChurches = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async ({ context }) => {
    invariant(context.session, 'Session not found');

    return db.organization.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
          },
          where: {
            appUserId: context.session.appUser.id,
          },
        },
      },
      where: {
        type: OrganizationType.CHURCH,
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
          },
        },
      },
    });
  });

const churchesQueryOptions = {
  queryKey: ['dashboard', 'churches'],
  queryFn: () => getChurches(),
} as const;

export const Route = createFileRoute('/dashboard_/churches')({
  component: ChurchesPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient } }) => {
    const data = await queryClient.ensureQueryData(churchesQueryOptions);
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
  const { data: churches } = Route.useLoaderData();

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
