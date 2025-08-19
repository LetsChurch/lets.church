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
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { useSetBackNavigation } from '@/util/back-navigation';
import db from '@/util/db';
import { formatDate } from '@/util/format';
import { hasValidSession, requireAuthMiddleware } from '../-functions';
import { StatCard } from './-components/stat-card';

const getChurchDetails = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ churchId: z.string() }))
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const church = await db.organization.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        avatarPath: true,
        primaryEmail: true,
        primaryPhoneNumber: true,
        websiteUrl: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
        },
        channelAssociations: {
          select: {
            channel: {
              select: {
                id: true,
                name: true,
                visibility: true,
                createdAt: true,
              },
            },
            officialChannel: true,
          },
        },
        leaders: {
          select: {
            id: true,
            type: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        addresses: {
          select: {
            id: true,
            type: true,
            name: true,
            streetAddress: true,
            locality: true,
            region: true,
            postalCode: true,
            country: true,
          },
        },
        _count: {
          select: {
            memberships: true,
            channelAssociations: true,
            leaders: true,
          },
        },
      },
      where: {
        id: data.churchId,
        type: 'CHURCH',
        memberships: {
          some: {
            appUserId: context.session.appUser.id,
          },
        },
      },
    });

    if (!church) {
      throw new Error('Church not found or access denied');
    }

    const userMembership = church.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    return {
      ...church,
      userMembership,
    } as const;
  });

const churchDetailsQueryOptions = (churchId: string) => ({
  queryKey: ['dashboard', 'churches', churchId],
  queryFn: () => getChurchDetails({ data: { churchId } }),
});

export const Route = createFileRoute('/dashboard_/churches_/$churchId')({
  component: ChurchDetailsPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient }, params }) => {
    return queryClient.ensureQueryData(
      churchDetailsQueryOptions(params.churchId),
    );
  },
});

function ChurchDetailsPage() {
  const { churchId } = Route.useParams();
  const { data: church } = useSuspenseQuery(
    churchDetailsQueryOptions(churchId),
  );

  const { userMembership } = church;
  const isAdmin = userMembership?.isAdmin ?? false;

  useSetBackNavigation('Churches', '/dashboard/churches');

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
          color="blue"
          icon={<IconUsers size={22} stroke={1.5} />}
          tooltip="Active members of this church organization"
          value={church._count.memberships}
        />

        <StatCard
          title="Channels"
          color="green"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Associated content channels for this church"
          value={church._count.channelAssociations}
        />

        <StatCard
          title="Leaders"
          color="violet"
          icon={<IconShield size={22} stroke={1.5} />}
          tooltip="Registered leadership team members"
          value={church._count.leaders}
        />
      </SimpleGrid>
    </Stack>
  );
}
