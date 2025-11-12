import {
  ActionIcon,
  Avatar,
  Badge,
  Container,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconTrash, IconUsers, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/dashboard_/organizations_/$orgId_/associations',
)({
  component: AssociationsPage,
  beforeLoad: async ({ context, params }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    // Check if user has access to this organization
    try {
      await context.queryClient.ensureQueryData(
        context.trpc.dashboard.organizations.getOrganizationDetails.queryOptions(
          {
            orgId: params.orgId,
          },
        ),
      );
    } catch (_error) {
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
      queryClient.ensureQueryData(
        trpc.dashboard.organizations.getUpstreamAssociations.queryOptions({
          orgId: params.orgId,
        }),
      ),
    ]);
    return {
      backNavigation: {
        label: 'Back to organization',
        to: '/dashboard/organizations/$orgId',
        params: { orgId: params.orgId },
      },
    };
  },
});

function AssociationsPage() {
  const { orgId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationDetails.queryOptions({
      orgId,
    }),
  );

  const { data: upstreamAssociations } = useSuspenseQuery(
    trpc.dashboard.organizations.getUpstreamAssociations.queryOptions({
      orgId,
    }),
  );

  const { userMembership } = organization;
  const isAdmin = userMembership?.isAdmin ?? false;

  const approveAssociationMutation = useMutation(
    trpc.dashboard.organizations.approveUpstreamAssociation.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Association approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.organizations.getUpstreamAssociations.queryKey({
              orgId,
            }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve association',
          color: 'red',
        });
      },
    }),
  );

  const unapproveAssociationMutation = useMutation(
    trpc.dashboard.organizations.unapproveUpstreamAssociation.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Association unapproved successfully',
          color: 'orange',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.organizations.getUpstreamAssociations.queryKey({
              orgId,
            }),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to unapprove association',
          color: 'red',
        });
      },
    }),
  );

  const deleteAssociationMutation = useMutation(
    trpc.dashboard.organizations.deleteUpstreamAssociation.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Association deleted successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.organizations.getUpstreamAssociations.queryKey({
              orgId,
            }),
        });
        // Also invalidate the organization details to update the counts
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
          message: 'Failed to delete association',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveAssociation = (downstreamOrganizationId: string) => {
    approveAssociationMutation.mutate({ orgId, downstreamOrganizationId });
  };

  const handleUnapproveAssociation = (downstreamOrganizationId: string) => {
    unapproveAssociationMutation.mutate({ orgId, downstreamOrganizationId });
  };

  const handleDeleteAssociation = (downstreamOrganizationId: string) => {
    deleteAssociationMutation.mutate({ orgId, downstreamOrganizationId });
  };

  const getStatusBadge = (
    upstreamApproved: boolean,
    downstreamApproved: boolean,
  ) => {
    if (upstreamApproved && downstreamApproved) {
      return (
        <Badge color="green" variant="light" size="sm">
          Active
        </Badge>
      );
    }
    if (upstreamApproved && !downstreamApproved) {
      return (
        <Badge color="blue" variant="light" size="sm">
          Approved (Pending Downstream)
        </Badge>
      );
    }
    if (!upstreamApproved && downstreamApproved) {
      return (
        <Badge color="yellow" variant="light" size="sm">
          Pending Approval
        </Badge>
      );
    }
    return (
      <Badge color="gray" variant="light" size="sm">
        Inactive
      </Badge>
    );
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <IconUsers size={24} />
              <Title order={1}>Organization Associations</Title>
            </Group>
            <Text c="dimmed" size="sm">
              Manage associations where {organization.name} is the upstream
              organization
            </Text>
          </div>
        </Group>

        {upstreamAssociations.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No downstream organizations associated with this organization yet.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Organization</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                {isAdmin && <Table.Th>Actions</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {upstreamAssociations.map((association) => (
                <Table.Tr key={association.downstreamOrganizationId}>
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar
                        size="sm"
                        src={
                          association.downstreamOrganization.avatarPath
                            ? `/api/media/${association.downstreamOrganization.avatarPath}`
                            : null
                        }
                        alt={association.downstreamOrganization.name}
                      >
                        {association.downstreamOrganization.name
                          .charAt(0)
                          .toUpperCase()}
                      </Avatar>
                      <div>
                        <Text fw={500}>
                          {association.downstreamOrganization.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          @{association.downstreamOrganization.slug}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="blue" variant="light" size="sm">
                      {association.downstreamOrganization.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {getStatusBadge(
                      association.upstreamApproved,
                      association.downstreamApproved,
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDate(association.createdAt)}
                    </Text>
                  </Table.Td>
                  {isAdmin && (
                    <Table.Td>
                      <Group gap="xs">
                        {association.upstreamApproved ? (
                          <ActionIcon
                            color="orange"
                            variant="light"
                            size="sm"
                            onClick={() =>
                              handleUnapproveAssociation(
                                association.downstreamOrganizationId,
                              )
                            }
                            loading={
                              unapproveAssociationMutation.isPending &&
                              unapproveAssociationMutation.variables
                                ?.downstreamOrganizationId ===
                                association.downstreamOrganizationId
                            }
                            aria-label="Unapprove association"
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon
                            color="green"
                            variant="light"
                            size="sm"
                            onClick={() =>
                              handleApproveAssociation(
                                association.downstreamOrganizationId,
                              )
                            }
                            loading={
                              approveAssociationMutation.isPending &&
                              approveAssociationMutation.variables
                                ?.downstreamOrganizationId ===
                                association.downstreamOrganizationId
                            }
                            aria-label="Approve association"
                          >
                            <IconCheck size={14} />
                          </ActionIcon>
                        )}
                        <ActionIcon
                          color="red"
                          variant="light"
                          size="sm"
                          onClick={() =>
                            handleDeleteAssociation(
                              association.downstreamOrganizationId,
                            )
                          }
                          loading={
                            deleteAssociationMutation.isPending &&
                            deleteAssociationMutation.variables
                              ?.downstreamOrganizationId ===
                              association.downstreamOrganizationId
                          }
                          aria-label="Delete association"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
