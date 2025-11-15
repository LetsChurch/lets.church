import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBroadcast, IconLink, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute(
  '/dashboard_/churches_/$churchId_/channels',
)({
  component: ChurchChannelsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    const church = await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchDetails.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: church.name,
        to: '/dashboard/churches/$churchId',
        params: { churchId: params.churchId },
      },
    };
  },
});

function ChurchChannelsPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchDetails.queryOptions({
      churchId,
    }),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );

  const isAdmin = church.userMembership?.isAdmin ?? false;

  const [
    linkChannelModalOpened,
    { open: openLinkChannelModal, close: closeLinkChannelModal },
  ] = useDisclosure();

  const handleCloseModal = () => {
    closeLinkChannelModal();
    setSearchQuery('');
    setSelectedChannelId(null);
    form.reset();
  };

  const form = useAppMantineForm({
    defaultValues: {
      officialChannel: false,
    },
    onSubmit: async ({ value }) => {
      if (!selectedChannelId) return;

      linkChannelMutation.mutate({
        churchId,
        channelId: selectedChannelId,
        officialChannel: value.officialChannel,
      });
    },
  });

  const { data: searchResults = [] } = useQuery({
    ...trpc.dashboard.churches.searchChannels.queryOptions({
      churchId,
      query: debouncedSearchQuery,
    }),
    enabled: debouncedSearchQuery.length >= 2,
    staleTime: 30000,
  });

  const linkChannelMutation = useMutation(
    trpc.dashboard.churches.linkChannel.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Channel linked successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchDetails.queryKey({
            churchId,
          }),
        });
        handleCloseModal();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to link channel' });
      },
    }),
  );

  const unlinkChannelMutation = useMutation(
    trpc.dashboard.churches.unlinkChannel.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Channel unlinked successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchDetails.queryKey({
            churchId,
          }),
        });
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to unlink channel' });
      },
    }),
  );

  const handleUnlinkChannel = (channelId: string) => {
    unlinkChannelMutation.mutate({
      churchId,
      channelId,
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1}>Channels</Title>
          <Text c="dimmed">
            {church.name} • {church.channelAssociations?.length || 0} associated
            channels
          </Text>
        </div>

        {isAdmin && (
          <Tooltip
            label="Link an existing channel to this church"
            disabled={isAdmin}
          >
            <Button
              leftSection={<IconLink size={16} />}
              onClick={openLinkChannelModal}
              disabled={!isAdmin}
            >
              Link Channel
            </Button>
          </Tooltip>
        )}
      </Group>

      <Modal
        opened={linkChannelModalOpened}
        onClose={handleCloseModal}
        title="Link Channel to Church"
        size="md"
        centered
      >
        <Stack gap="md">
          <div>
            <TextInput
              label="Search for channel"
              placeholder="Start typing a channel name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.currentTarget.value);
                setSelectedChannelId(null);
              }}
              mb="xs"
            />

            {debouncedSearchQuery.length >= 2 && searchResults.length > 0 && (
              <Stack gap="xs" mah={200} style={{ overflowY: 'auto' }}>
                {searchResults.map((channel) => (
                  <Group
                    key={channel.id}
                    p="sm"
                    bg={selectedChannelId === channel.id ? 'blue.1' : 'gray.0'}
                    style={{
                      borderRadius: 8,
                      cursor: 'pointer',
                      border:
                        selectedChannelId === channel.id
                          ? '1px solid var(--mantine-color-blue-6)'
                          : '1px solid transparent',
                    }}
                    onClick={() => {
                      setSelectedChannelId(channel.id);
                      setSearchQuery(channel.name);
                    }}
                  >
                    <Avatar size="sm" bg="blue">
                      <IconBroadcast size={16} color="white" />
                    </Avatar>
                    <div>
                      <Text size="sm" fw={500}>
                        {channel.name}
                      </Text>
                      <Group gap="xs">
                        <Badge
                          color={
                            channel.visibility === 'PUBLIC' ? 'green' : 'orange'
                          }
                          size="xs"
                        >
                          {channel.visibility}
                        </Badge>
                        {channel.description && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {channel.description}
                          </Text>
                        )}
                      </Group>
                    </div>
                  </Group>
                ))}
              </Stack>
            )}

            {debouncedSearchQuery.length >= 2 && searchResults.length === 0 && (
              <Text size="sm" c="dimmed" p="sm">
                No channels found matching "{debouncedSearchQuery}"
              </Text>
            )}
          </div>

          {selectedChannelId && (
            <>
              <Text size="sm" fw={500}>
                Channel Type
              </Text>

              <form.AppField name="officialChannel">
                {(field) => (
                  <field.CheckboxField label="Official Church Channel" />
                )}
              </form.AppField>

              <Text size="xs" c="dimmed" mt="xs">
                <strong>Note:</strong> You can only link channels that exist on
                the platform. Official channels will be prominently displayed as
                representing the church.
              </Text>
            </>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedChannelId}
                loading={linkChannelMutation.isPending}
              >
                Link Channel
              </Button>
            </Group>
          </form>
        </Stack>
      </Modal>

      <Table verticalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Visibility</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {church.channelAssociations?.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text ta="center" c="dimmed" py="xl">
                  No channels associated with this church
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            church.channelAssociations?.map((association) => (
              <Table.Tr key={association.channel.id}>
                <Table.Td>
                  <Text fw={500} size="sm">
                    {association.channel.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={association.officialChannel ? 'blue' : 'gray'}
                    size="sm"
                  >
                    {association.officialChannel ? 'Official' : 'Associated'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      association.channel.visibility === 'PUBLIC'
                        ? 'green'
                        : 'orange'
                    }
                    size="sm"
                  >
                    {association.channel.visibility}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {formatDate(association.channel.createdAt, 'short')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {(() => {
                    const canUnlink = isAdmin;
                    const tooltipText = !isAdmin
                      ? 'Only admins can unlink channels'
                      : 'Unlink this channel from the church';

                    return (
                      <Tooltip label={tooltipText}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          disabled={!canUnlink}
                          onClick={() =>
                            canUnlink &&
                            handleUnlinkChannel(association.channel.id)
                          }
                          loading={unlinkChannelMutation.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    );
                  })()}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
