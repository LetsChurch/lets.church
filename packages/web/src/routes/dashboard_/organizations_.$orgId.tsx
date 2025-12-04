import {
  Avatar,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconNetwork, IconUsers, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { StatCard } from './-components/stat-card';
import styles from './-styles.module.css';

export const Route = createFileRoute('/dashboard_/organizations_/$orgId')({
  component: OrganizationDetailsPage,
  beforeLoad: async ({ context, params }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    // Check if user has access to this organization (either member or site admin)
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    // Site admins can access any organization
    if (currentUser.role === 'ADMIN') {
      return { isSiteAdmin: true };
    }

    // Check if user is a member of this organization
    try {
      await context.queryClient.ensureQueryData(
        context.trpc.dashboard.organizations.getOrganizationDetails.queryOptions(
          {
            orgId: params.orgId,
          },
        ),
      );
      return { isSiteAdmin: false };
    } catch (_error) {
      // If user is not a member and not an admin, redirect
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        trpc.dashboard.organizations.getOrganizationDetails.queryOptions({
          orgId: params.orgId,
        }),
      ),
    ]);
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
  const queryClient = useQueryClient();
  const { isSiteAdmin } = Route.useRouteContext() as { isSiteAdmin: boolean };

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationDetails.queryOptions({
      orgId,
    }),
  );

  const { userMembership } = organization;
  const isAdmin = userMembership?.isAdmin ?? false;
  const isApproved = Boolean(organization.approvedAt);

  const approveOrganizationMutation = useMutation(
    trpc.dashboard.organizations.approveOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.organizations.getOrganizationDetails.queryKey({
              orgId,
            }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve organization',
          color: 'red',
        });
      },
    }),
  );

  const unapproveOrganizationMutation = useMutation(
    trpc.dashboard.organizations.unapproveOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization unapproved successfully',
          color: 'orange',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.organizations.getOrganizationDetails.queryKey({
              orgId,
            }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to unapprove organization',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveOrganization = () => {
    approveOrganizationMutation.mutate({ orgId });
  };

  const handleUnapproveOrganization = () => {
    unapproveOrganizationMutation.mutate({ orgId });
  };

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
              <Tooltip
                label={
                  isApproved
                    ? 'This organization has been approved and is visible to the public'
                    : 'This organization is pending approval and not yet visible to the public'
                }
                withArrow
              >
                <Badge color={isApproved ? 'green' : 'yellow'} size="sm">
                  {isApproved ? 'Approved' : 'Pending'}
                </Badge>
              </Tooltip>
              <Tooltip
                label={
                  organization.type === 'MINISTRY'
                    ? 'A ministry or denominational organization'
                    : organization.type === 'CHURCH'
                      ? 'A local church or congregation'
                      : 'An educational or other religious organization'
                }
                withArrow
              >
                <Badge color="blue" variant="light" size="sm">
                  {organization.type}
                </Badge>
              </Tooltip>
              <Tooltip
                label={
                  isAdmin
                    ? 'You can edit this organization and manage settings'
                    : 'You have access to view this organization'
                }
                withArrow
              >
                <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                  {isAdmin ? 'Admin' : 'User'}
                </Badge>
              </Tooltip>
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
          {isSiteAdmin &&
            (!isApproved ? (
              <Button
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={handleApproveOrganization}
                loading={approveOrganizationMutation.isPending}
              >
                Approve Organization
              </Button>
            ) : (
              <Button
                color="orange"
                leftSection={<IconX size={16} />}
                onClick={handleUnapproveOrganization}
                loading={unapproveOrganizationMutation.isPending}
              >
                Unapprove Organization
              </Button>
            ))}
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
          tooltip="People who can view and edit this organization profile"
          value={organization._count.memberships}
        />
        <StatCard
          title="Associations"
          to="/dashboard/organizations/$orgId/associations"
          color="violet"
          icon={<IconNetwork size={22} stroke={1.5} />}
          tooltip="Churches and organizations connected to this organization"
          value={
            <Text>
              {organization._count.downstreamOrganizationAssociations}{' '}
              <Text span size="sm" c="orange.6">
                ({organization.unapprovedAssociationsCount} pending)
              </Text>
            </Text>
          }
        />
      </SimpleGrid>
    </Stack>
  );
}
