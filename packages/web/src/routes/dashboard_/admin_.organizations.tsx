import {
  ActionIcon,
  Avatar,
  Badge,
  Container,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconMapPin,
  IconRefresh,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { DeleteOrganizationModal } from '@/components/delete-organization-modal';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/dashboard_/admin_/organizations')({
  component: OrganizationsAdminPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getAllOrganizations.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    filter?: 'all' | 'pending' | 'approved' | 'churches' | 'ministries';
  } => {
    return {
      filter:
        search.filter === 'all' ||
        search.filter === 'pending' ||
        search.filter === 'approved' ||
        search.filter === 'churches' ||
        search.filter === 'ministries'
          ? search.filter
          : 'all',
    };
  },
});

function getGeocodingStatus(
  addresses: Array<{ latitude: number | null; longitude: number | null }>,
) {
  if (addresses.length === 0) {
    return { status: 'no-address', label: 'No Address', color: 'gray' };
  }

  const geocodedCount = addresses.filter(
    (addr) => addr.latitude && addr.longitude,
  ).length;

  if (geocodedCount === addresses.length) {
    return { status: 'complete', label: 'Geocoded', color: 'green' };
  }

  if (geocodedCount > 0) {
    return {
      status: 'partial',
      label: `${geocodedCount}/${addresses.length}`,
      color: 'yellow',
    };
  }

  return { status: 'none', label: 'Not Geocoded', color: 'red' };
}

function OrganizationsAdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { filter = 'all' } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);
  const [organizationToDelete, setOrganizationToDelete] = useState<{
    id: string;
    name: string;
    type: 'CHURCH' | 'MINISTRY';
  } | null>(null);

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getAllOrganizations.queryOptions({
      filter,
      search: debouncedSearch || undefined,
    }),
  );

  const {
    organizations,
    pendingCount,
    approvedCount,
    churchCount,
    ministryCount,
  } = data;

  const approveOrganizationMutation = useMutation(
    trpc.dashboard.admin.approveOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllOrganizations.queryKey(),
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

  const deleteOrganizationMutation = useMutation(
    trpc.dashboard.admin.deleteOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization deleted successfully',
          color: 'green',
        });
        closeDeleteModal();
        setOrganizationToDelete(null);
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllOrganizations.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to delete organization',
          color: 'red',
        });
      },
    }),
  );

  const retryGeocodingMutation = useMutation(
    trpc.dashboard.admin.retryGeocoding.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Geocoding Started',
          message: 'Geocoding workflow has been started',
          color: 'blue',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllOrganizations.queryKey(),
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error',
          message: error.message || 'Failed to start geocoding',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveOrganization = (organizationId: string) => {
    approveOrganizationMutation.mutate({ organizationId });
  };

  const handleDeleteOrganization = (
    organizationId: string,
    organizationName: string,
    organizationType: 'CHURCH' | 'MINISTRY',
  ) => {
    setOrganizationToDelete({
      id: organizationId,
      name: organizationName,
      type: organizationType,
    });
    openDeleteModal();
  };

  const confirmDeleteOrganization = () => {
    if (organizationToDelete) {
      deleteOrganizationMutation.mutate({
        organizationId: organizationToDelete.id,
      });
    }
  };

  const handleRetryGeocoding = (organizationId: string) => {
    retryGeocodingMutation.mutate({ organizationId });
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <div>
          <Title order={1} mb="xs">
            Organizations
          </Title>
          <Text c="dimmed" size="sm">
            Manage all organizations on the platform
          </Text>
        </div>

        <TextInput
          placeholder="Search organizations by name or slug..."
          leftSection={<IconMapPin size={16} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />

        <Tabs
          value={filter}
          onChange={(value) =>
            navigate({
              search: {
                filter:
                  (value as
                    | 'all'
                    | 'pending'
                    | 'approved'
                    | 'churches'
                    | 'ministries') || 'all',
              },
            })
          }
        >
          <Tabs.List>
            <Tabs.Tab
              value="all"
              rightSection={
                <Badge size="sm">{churchCount + ministryCount}</Badge>
              }
            >
              All Organizations
            </Tabs.Tab>
            <Tabs.Tab
              value="churches"
              rightSection={
                <Badge size="sm" color="blue">
                  {churchCount}
                </Badge>
              }
            >
              Churches
            </Tabs.Tab>
            <Tabs.Tab
              value="ministries"
              rightSection={
                <Badge size="sm" color="purple">
                  {ministryCount}
                </Badge>
              }
            >
              Ministries
            </Tabs.Tab>
            <Tabs.Tab
              value="pending"
              rightSection={
                pendingCount > 0 ? (
                  <Badge size="sm" color="orange">
                    {pendingCount}
                  </Badge>
                ) : null
              }
            >
              Pending
            </Tabs.Tab>
            <Tabs.Tab
              value="approved"
              rightSection={
                <Badge size="sm" color="green">
                  {approvedCount}
                </Badge>
              }
            >
              Approved
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={filter} pt="md">
            {organizations.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {debouncedSearch
                  ? 'No organizations found matching your search.'
                  : filter === 'pending'
                    ? 'No pending organization approvals.'
                    : filter === 'approved'
                      ? 'No approved organizations.'
                      : filter === 'churches'
                        ? 'No churches found.'
                        : filter === 'ministries'
                          ? 'No ministries found.'
                          : 'No organizations found.'}
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Organization</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Geocoding</Table.Th>
                    <Table.Th>Stats</Table.Th>
                    <Table.Th>Admin</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {organizations.map((org) => {
                    const geocodingStatus = getGeocodingStatus(org.addresses);

                    return (
                      <Table.Tr key={org.id}>
                        <Table.Td>
                          <Group gap="sm">
                            <Avatar
                              size="sm"
                              src={org.avatarUrl}
                              alt={org.name}
                            >
                              {org.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <div>
                              <Text
                                fw={500}
                                renderRoot={(rootProps) => (
                                  <Link
                                    {...rootProps}
                                    to="/dashboard/churches/$churchId"
                                    params={{ churchId: org.id }}
                                    style={{
                                      textDecoration: 'none',
                                      color: 'inherit',
                                    }}
                                  >
                                    {org.name}
                                  </Link>
                                )}
                              />
                              <Text size="xs" c="dimmed">
                                @{org.slug}
                              </Text>
                            </div>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={org.type === 'CHURCH' ? 'blue' : 'purple'}
                            variant="light"
                            size="sm"
                          >
                            {org.type === 'CHURCH' ? 'Church' : 'Ministry'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {org.approvedAt ? (
                            <Badge color="green" variant="light" size="sm">
                              Approved
                            </Badge>
                          ) : (
                            <Badge color="orange" variant="light" size="sm">
                              Pending
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Tooltip
                            label={
                              geocodingStatus.status === 'no-address'
                                ? 'No addresses configured'
                                : geocodingStatus.status === 'complete'
                                  ? 'All addresses geocoded'
                                  : geocodingStatus.status === 'partial'
                                    ? 'Some addresses geocoded'
                                    : 'No addresses geocoded'
                            }
                          >
                            <Badge
                              color={geocodingStatus.color}
                              variant="light"
                              size="sm"
                            >
                              {geocodingStatus.label}
                            </Badge>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="md">
                            <Group gap={4}>
                              <IconMapPin size={14} />
                              <Text size="xs">
                                {org._count.channelAssociations}
                              </Text>
                            </Group>
                            <Group gap={4}>
                              <IconUsers size={14} />
                              <Text size="xs">{org._count.memberships}</Text>
                            </Group>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {org.memberships[0]?.appUser ? (
                            <div>
                              <Text size="sm" fw={500}>
                                {org.memberships[0].appUser.fullName}
                              </Text>
                              {org.memberships[0].appUser.emails[0] ? (
                                <Text size="xs" c="dimmed">
                                  {org.memberships[0].appUser.emails[0].email}
                                </Text>
                              ) : null}
                            </div>
                          ) : (
                            <Text size="sm" c="dimmed">
                              No admin
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatDate(org.createdAt)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {!org.approvedAt ? (
                              <Tooltip label="Approve organization">
                                <ActionIcon
                                  color="green"
                                  variant="light"
                                  size="sm"
                                  onClick={() =>
                                    handleApproveOrganization(org.id)
                                  }
                                  loading={
                                    approveOrganizationMutation.isPending &&
                                    approveOrganizationMutation.variables
                                      ?.organizationId === org.id
                                  }
                                  aria-label="Approve organization"
                                >
                                  <IconCheck size={14} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            {org.addresses.length > 0 ? (
                              <Tooltip label="Retry geocoding">
                                <ActionIcon
                                  color="blue"
                                  variant="light"
                                  size="sm"
                                  onClick={() => handleRetryGeocoding(org.id)}
                                  loading={
                                    retryGeocodingMutation.isPending &&
                                    retryGeocodingMutation.variables
                                      ?.organizationId === org.id
                                  }
                                  aria-label="Retry geocoding"
                                >
                                  <IconRefresh size={14} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            <Tooltip label="Delete organization">
                              <ActionIcon
                                color="red"
                                variant="light"
                                size="sm"
                                onClick={() =>
                                  handleDeleteOrganization(
                                    org.id,
                                    org.name,
                                    org.type,
                                  )
                                }
                                loading={
                                  deleteOrganizationMutation.isPending &&
                                  deleteOrganizationMutation.variables
                                    ?.organizationId === org.id
                                }
                                aria-label="Delete organization"
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      {organizationToDelete ? (
        <DeleteOrganizationModal
          opened={deleteModalOpened}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteOrganization}
          organizationName={organizationToDelete.name}
          organizationType={organizationToDelete.type}
          isDeleting={deleteOrganizationMutation.isPending}
        />
      ) : null}
    </Container>
  );
}
