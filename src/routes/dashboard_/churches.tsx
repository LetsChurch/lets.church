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
import { OrganizationType } from '@prisma/client';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { getSession } from '@/util/auth';
import db from '@/util/db';
import { hasValidSession, requireAuthMiddleware } from '../-functions';

const getChurches = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    const session = await getSession();
    invariant(session, 'Session not found');

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
            appUserId: session.appUser.id,
          },
        },
      },
      where: {
        type: OrganizationType.CHURCH,
        memberships: {
          some: {
            appUserId: session.appUser.id,
          },
        },
      },
    });
  });

export const Route = createFileRoute('/dashboard_/churches')({
  component: ChurchesPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient } }) => {
    return queryClient.ensureQueryData({
      queryKey: ['dashboard', 'churches'],
      queryFn: () => getChurches(),
    });
  },
});

function ChurchesPage() {
  const { data: churches } = useSuspenseQuery({
    queryKey: ['dashboard', 'churches'],
    queryFn: () => getChurches(),
  });

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>Churches</Title>
        <Button>Join Church</Button>
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
              >
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>{church.name}</Text>
                  <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                    {isAdmin ? 'Admin' : 'Member'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  {church.description ||
                    (isAdmin
                      ? 'You have administrative access to this church.'
                      : 'You are a member of this church.')}
                </Text>
                <Group>
                  <Button variant="light" size="sm">
                    View Details
                  </Button>
                  {isAdmin && (
                    <Button variant="light" size="sm">
                      Manage
                    </Button>
                  )}
                  <Button variant="light" size="sm" color="red">
                    Leave
                  </Button>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </>
  );
}
