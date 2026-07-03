import { Combobox } from '@base-ui/react/combobox';
import { IconBroadcast, IconLink, IconTrash, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Badge,
  Button,
  InputWrapper,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { controlClasses } from '@/components/ui/input';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/churches_/$churchId_/channels',
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
  // The picked channel (the combobox's selected value). `null` until one is
  // chosen; editing the combobox input clears it so the Link button re-disables.
  const [selectedChannel, setSelectedChannel] = useState<{
    value: string;
    label: string;
  } | null>(null);

  const isAdmin = church.userMembership?.isAdmin ?? false;

  const [
    linkChannelModalOpened,
    { open: openLinkChannelModal, close: closeLinkChannelModal },
  ] = useDisclosure();

  const handleCloseModal = () => {
    closeLinkChannelModal();
    setSearchQuery('');
    setSelectedChannel(null);
    form.reset();
  };

  const form = useAppForm({
    defaultValues: {
      officialChannel: false,
    },
    onSubmit: async ({ value }) => {
      if (!selectedChannel) return;

      linkChannelMutation.mutate({
        churchId,
        channelId: selectedChannel.value,
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
      </div>

      <LcModal.Root
        open={linkChannelModalOpened}
        onOpenChange={(o) => {
          if (!o) handleCloseModal();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Link Channel to Church" />
            <div className="flex flex-col gap-4">
              {/* Base UI Combobox: accessible listbox with keyboard navigation,
                  and results float in a popover so the modal doesn't resize.
                  Results are searched server-side, so disable the client filter. */}
              <Combobox.Root
                items={searchResults.map((channel) => ({
                  value: channel.id,
                  label: channel.name,
                  channel,
                }))}
                value={selectedChannel}
                onValueChange={(item) =>
                  setSelectedChannel(
                    item ? { value: item.value, label: item.label } : null,
                  )
                }
                inputValue={searchQuery}
                onInputValueChange={(value) => {
                  setSearchQuery(value);
                  // Keep the pick only while the input still shows its name;
                  // any edit away from it invalidates the selection so the Link
                  // button re-disables. (Selecting an item sets the input to the
                  // name, so the pick survives.)
                  setSelectedChannel((prev) =>
                    prev && prev.label === value ? prev : null,
                  );
                }}
                isItemEqualToValue={(item, value) =>
                  item.value === value?.value
                }
                itemToStringLabel={(item) => item.label}
                filter={null}
              >
                <InputWrapper label="Search for channel">
                  <div className="relative">
                    <Combobox.Input
                      placeholder="Start typing a channel name..."
                      className={cn(controlClasses(), 'pr-8')}
                    />
                    <Combobox.Clear
                      aria-label="Clear channel search"
                      className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted hover:text-primary"
                    >
                      <IconX size={16} />
                    </Combobox.Clear>
                  </div>
                </InputWrapper>
                <Combobox.Portal>
                  <Combobox.Positioner sideOffset={4} className="z-[60]">
                    <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border-fancy-pants bg-white p-1 shadow-lg dark:bg-zinc-900">
                      <Combobox.Empty className="px-3 py-6 text-center text-secondary text-sm empty:hidden">
                        {debouncedSearchQuery.length < 2
                          ? 'Type at least 2 characters to search.'
                          : 'No channels found.'}
                      </Combobox.Empty>
                      <Combobox.List>
                        {(item: {
                          value: string;
                          label: string;
                          channel: (typeof searchResults)[number];
                        }) => (
                          <Combobox.Item
                            key={item.value}
                            value={item}
                            className="flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 data-[highlighted]:bg-brand/10"
                          >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
                              <IconBroadcast size={16} className="text-white" />
                            </div>
                            <div className="min-w-0">
                              <Text size="sm" fw={500}>
                                {item.channel.name}
                              </Text>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <Badge
                                  color={
                                    item.channel.visibility === 'PUBLIC'
                                      ? 'green'
                                      : 'orange'
                                  }
                                  size="xs"
                                >
                                  {item.channel.visibility}
                                </Badge>
                                {item.channel.description && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {item.channel.description}
                                  </Text>
                                )}
                              </div>
                            </div>
                          </Combobox.Item>
                        )}
                      </Combobox.List>
                    </Combobox.Popup>
                  </Combobox.Positioner>
                </Combobox.Portal>
              </Combobox.Root>

              {selectedChannel && (
                <>
                  <Text size="sm" fw={500}>
                    Channel Type
                  </Text>

                  <form.AppField name="officialChannel">
                    {(field) => (
                      <field.CheckboxField label="Official Church Channel" />
                    )}
                  </form.AppField>

                  <Text size="xs" c="dimmed" className="mt-2.5">
                    <strong>Note:</strong> You can only link channels that exist
                    on the platform. Official channels will be prominently
                    displayed as representing the church.
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
                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                  <Button variant="outline" onClick={handleCloseModal}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!selectedChannel}
                    loading={linkChannelMutation.isPending}
                  >
                    Link Channel
                  </Button>
                </div>
              </form>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <Table>
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
                <Text ta="center" c="dimmed" className="py-8">
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
    </div>
  );
}
