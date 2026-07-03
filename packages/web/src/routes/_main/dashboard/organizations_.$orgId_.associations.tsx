import { IconCheck, IconTrash, IconUsers, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { ActionIcon, Avatar, Badge, Table, Text, Title } from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/organizations_/$orgId_/associations',
)({
  component: AssociationsPage,
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
  const { isSiteAdmin } = Route.useRouteContext() as { isSiteAdmin: boolean };

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
  const isAdmin = userMembership?.isAdmin ?? isSiteAdmin;

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
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-start gap-3">
              <IconUsers size={24} />
              <Title order={1}>Organization Associations</Title>
            </div>
            <Text c="dimmed" size="sm">
              Manage associations where {organization.name} is the upstream
              organization
            </Text>
          </div>
        </div>

        {upstreamAssociations.length === 0 ? (
          <Text c="dimmed" ta="center" className="py-8">
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
                    <div className="flex flex-wrap items-center justify-start gap-3">
                      <Avatar
                        className="size-8"
                        src={association.downstreamOrganization.avatarUrl}
                        alt={association.downstreamOrganization.name}
                      />
                      <div>
                        <Text fw={500}>
                          {association.downstreamOrganization.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          @{association.downstreamOrganization.slug}
                        </Text>
                      </div>
                    </div>
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
                      <div className="flex flex-wrap items-center justify-start gap-2.5">
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
                      </div>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
