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
import { IconUsers } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { StatCard } from './-components/stat-card';
import styles from './-styles.module.css';

export const Route = createFileRoute('/dashboard_/organizations_/$orgId')({
  component: OrganizationDetailsPage,
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
      trpc.dashboard.organizations.getOrganizationDetails.queryOptions({
        orgId: params.orgId,
      }),
    );
    return {
      backNavigation: {
        label: 'Organizations',
        to: '/dashboard/organizations',
      },
    };
  },
});

function OrganizationDetailsPage() {
  const { orgId } = Route.useParams();
  const trpc = useTRPC();

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationDetails.queryOptions({
      orgId,
    }),
  );

  const { userMembership } = organization;
  const isAdmin = userMembership?.isAdmin ?? false;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start">
          <Avatar
            size="xl"
            src={
              organization.avatarPath
                ? `/api/media/${organization.avatarPath}`
                : null
            }
            alt={organization.name}
          >
            {organization.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>{organization.name}</Title>
              <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                {isAdmin ? 'Admin' : 'User'}
              </Badge>
            </Group>
            <Group gap="md" mb="sm">
              <Text c="dimmed">@{organization.slug}</Text>
              <Text c="dimmed" size="sm">
                Founded {formatDate(organization.createdAt)}
              </Text>
            </Group>
            {organization.description && (
              <Text size="sm" maw={600}>
                {organization.description}
              </Text>
            )}
          </div>
        </Group>
        <Group>
          {isAdmin && (
            <Button
              variant="light"
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  className={clsx(rootProps.className, styles.buttonLink)}
                  to="/dashboard/organizations/$orgId/edit"
                  params={{ orgId: organization.id }}
                >
                  Edit Organization
                </Link>
              )}
            />
          )}
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        <StatCard
          title="Users"
          to="/dashboard/organizations/$orgId/members"
          color="blue"
          icon={<IconUsers size={22} stroke={1.5} />}
          tooltip="Manage active users of this organization profile"
          value={organization._count.memberships}
        />
      </SimpleGrid>
    </Stack>
  );
}
