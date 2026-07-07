import {
  IconCheck,
  IconChevronDown,
  IconMicrophone,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { LcMenu, MenuItemButton } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Badge,
  Button,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/speakers',
)({
  component: ChannelSpeakersPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannelSpeakers.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelSpeakersPage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: speakersData } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelSpeakers.queryOptions({ channelId }),
  );
  const canAdmin = speakersData.canAdmin;

  const incomingQuery = useQuery({
    ...trpc.dashboard.channels.getIncomingSpeakerLinkRequests.queryOptions({
      channelId,
    }),
    enabled: canAdmin,
  });

  const outgoingQuery = useQuery(
    trpc.dashboard.channels.getOutgoingSpeakerLinkRequests.queryOptions({
      channelId,
    }),
  );

  const invalidateSpeakers = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getChannelSpeakers.queryKey({
        channelId,
      }),
    });
  const invalidateIncoming = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getIncomingSpeakerLinkRequests.queryKey(
        {
          channelId,
        },
      ),
    });
  const invalidateOutgoing = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getOutgoingSpeakerLinkRequests.queryKey(
        {
          channelId,
        },
      ),
    });

  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure();
  const [newName, setNewName] = useState('');
  const [newBio, setNewBio] = useState('');
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    bio: string;
  } | null>(null);

  const onError = (error: { message?: string }) =>
    showFailure({ message: error.message || 'Something went wrong' });

  const createMutation = useMutation(
    trpc.dashboard.channels.createSpeaker.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Speaker created' });
        closeAdd();
        setNewName('');
        setNewBio('');
        await invalidateSpeakers();
      },
      onError,
    }),
  );
  const updateMutation = useMutation(
    trpc.dashboard.channels.updateSpeaker.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Speaker updated' });
        setEditing(null);
        await invalidateSpeakers();
      },
      onError,
    }),
  );
  const deleteMutation = useMutation(
    trpc.dashboard.channels.deleteSpeaker.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Speaker deleted' });
        await invalidateSpeakers();
      },
      onError,
    }),
  );
  const approveMutation = useMutation(
    trpc.dashboard.channels.approveSpeakerLink.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Link approved' });
        await invalidateIncoming();
      },
      onError,
    }),
  );
  const declineMutation = useMutation(
    trpc.dashboard.channels.declineSpeakerLink.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Link declined' });
        await invalidateIncoming();
      },
      onError,
    }),
  );
  const cancelMutation = useMutation(
    trpc.dashboard.channels.cancelSpeakerLinkRequest.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Request cancelled' });
        await invalidateOutgoing();
      },
      onError,
    }),
  );

  const incomingTagQuery = useQuery({
    ...trpc.dashboard.channels.getIncomingTagRequests.queryOptions({
      channelId,
    }),
    enabled: canAdmin,
  });
  const invalidateIncomingTags = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getIncomingTagRequests.queryKey({
        channelId,
      }),
    });
  const approveTagMutation = useMutation(
    trpc.dashboard.channels.approveTagRequest.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Speaker tagged on the upload' });
        await invalidateIncomingTags();
      },
      onError,
    }),
  );
  const declineTagMutation = useMutation(
    trpc.dashboard.channels.declineTagRequest.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Tag request declined' });
        await invalidateIncomingTags();
      },
      onError,
    }),
  );

  const incoming = incomingQuery.data ?? [];
  const outgoing = outgoingQuery.data ?? [];
  const incomingTags = incomingTagQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Speakers</Title>
          <Text c="dimmed">
            {speakersData.speakers.length} speaker
            {speakersData.speakers.length === 1 ? '' : 's'}
          </Text>
        </div>
        {canAdmin ? (
          <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
            Add Speaker
          </Button>
        ) : null}
      </div>

      {/* Incoming cross-channel link requests (admins). */}
      {canAdmin && incoming.length > 0 ? (
        <>
          <Title order={3}>Incoming link requests</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Speaker</Table.Th>
                <Table.Th>Requesting channel</Table.Th>
                <Table.Th>Scope</Table.Th>
                <Table.Th>Requested</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {incoming.map((req) => (
                <Table.Tr key={req.id}>
                  <Table.Td>{req.speakerName}</Table.Td>
                  <Table.Td>{req.requestingChannelName}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {req.requestedForUploadId
                        ? 'A specific upload'
                        : 'Entire channel'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(req.createdAt, 'short')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      {req.requestedForUploadId ? (
                        <LcMenu.Root>
                          <LcMenu.Trigger
                            render={
                              <Button
                                size="xs"
                                color="green"
                                rightSection={<IconChevronDown size={14} />}
                                loading={approveMutation.isPending}
                              >
                                Approve
                              </Button>
                            }
                          />
                          <LcMenu.Portal>
                            <LcMenu.Positioner align="end" sideOffset={4}>
                              <LcMenu.Popup>
                                <MenuItemButton
                                  onClick={() =>
                                    approveMutation.mutate({
                                      channelId,
                                      linkId: req.id,
                                      scope: 'upload',
                                    })
                                  }
                                >
                                  For the requested upload only
                                </MenuItemButton>
                                <MenuItemButton
                                  onClick={() =>
                                    approveMutation.mutate({
                                      channelId,
                                      linkId: req.id,
                                      scope: 'channel',
                                    })
                                  }
                                >
                                  For their entire channel
                                </MenuItemButton>
                              </LcMenu.Popup>
                            </LcMenu.Positioner>
                          </LcMenu.Portal>
                        </LcMenu.Root>
                      ) : (
                        <Button
                          size="xs"
                          color="green"
                          leftSection={<IconCheck size={14} />}
                          loading={approveMutation.isPending}
                          onClick={() =>
                            approveMutation.mutate({
                              channelId,
                              linkId: req.id,
                              scope: 'channel',
                            })
                          }
                        >
                          Approve
                        </Button>
                      )}
                      <Tooltip label="Decline">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          loading={declineMutation.isPending}
                          onClick={() =>
                            declineMutation.mutate({
                              channelId,
                              linkId: req.id,
                            })
                          }
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </div>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <hr className="my-4" />
        </>
      ) : null}

      {/* Incoming requests from other channels to tag THEIR speaker on our
          uploads. Approving performs the attribution. */}
      {canAdmin && incomingTags.length > 0 ? (
        <>
          <Title order={3}>Incoming tag requests</Title>
          <Text size="sm" c="dimmed">
            Other channels asking you to tag their speaker on your uploads.
            Approving tags the speaker on that upload.
          </Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Speaker</Table.Th>
                <Table.Th>From channel</Table.Th>
                <Table.Th>Your upload</Table.Th>
                <Table.Th>Requested</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {incomingTags.map((req) => (
                <Table.Tr key={req.id}>
                  <Table.Td>{req.speakerName}</Table.Td>
                  <Table.Td>{req.ownerChannelName}</Table.Td>
                  <Table.Td>{req.uploadTitle ?? 'Untitled'}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(req.createdAt, 'short')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      <Button
                        size="xs"
                        color="green"
                        leftSection={<IconCheck size={14} />}
                        loading={approveTagMutation.isPending}
                        onClick={() =>
                          approveTagMutation.mutate({
                            channelId,
                            requestId: req.id,
                          })
                        }
                      >
                        Approve & tag
                      </Button>
                      <Tooltip label="Decline">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          loading={declineTagMutation.isPending}
                          onClick={() =>
                            declineTagMutation.mutate({
                              channelId,
                              requestId: req.id,
                            })
                          }
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </div>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <hr className="my-4" />
        </>
      ) : null}

      {/* Outgoing requests to other channels' speakers. */}
      {outgoing.length > 0 ? (
        <>
          <Title order={3}>Your link requests</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Speaker</Table.Th>
                <Table.Th>Owned by</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {outgoing.map((req) => (
                <Table.Tr key={req.id}>
                  <Table.Td>{req.speakerName}</Table.Td>
                  <Table.Td>{req.ownerChannelName}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        req.status === 'ACCEPTED'
                          ? 'green'
                          : req.status === 'PENDING'
                            ? 'yellow'
                            : 'gray'
                      }
                      variant="light"
                    >
                      {req.status === 'ACCEPTED'
                        ? req.grantedUploadId
                          ? 'Approved (one upload)'
                          : 'Approved'
                        : req.status.charAt(0) +
                          req.status.slice(1).toLowerCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {req.status === 'PENDING' && canAdmin ? (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        loading={cancelMutation.isPending}
                        onClick={() =>
                          cancelMutation.mutate({ channelId, linkId: req.id })
                        }
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <hr className="my-4" />
        </>
      ) : null}

      {/* Speaker library. */}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Speaker</Table.Th>
            <Table.Th>Attributions</Table.Th>
            <Table.Th>Added</Table.Th>
            {canAdmin ? <Table.Th>Actions</Table.Th> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {speakersData.speakers.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={canAdmin ? 4 : 3}>
                <Text ta="center" c="dimmed" className="py-8">
                  No speakers yet. Add one, or label a speaker from a
                  transcript.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            speakersData.speakers.map((speaker) => (
              <Table.Tr key={speaker.id}>
                <Table.Td>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    <IconMicrophone size={16} />
                    <div>
                      <Text size="sm" fw={500}>
                        {speaker.name}
                      </Text>
                      {speaker.bio ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {speaker.bio}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{speaker.attributionCount}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {formatDate(speaker.createdAt, 'short')}
                  </Text>
                </Table.Td>
                {canAdmin ? (
                  <Table.Td>
                    <div className="flex flex-wrap items-center justify-start gap-2.5">
                      <Tooltip label="Edit">
                        <ActionIcon
                          variant="subtle"
                          onClick={() =>
                            setEditing({
                              id: speaker.id,
                              name: speaker.name,
                              bio: speaker.bio ?? '',
                            })
                          }
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          loading={deleteMutation.isPending}
                          onClick={() =>
                            deleteMutation.mutate({
                              channelId,
                              speakerId: speaker.id,
                            })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </div>
                  </Table.Td>
                ) : null}
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      {/* Add speaker modal */}
      <LcModal.Root
        open={addOpened}
        onOpenChange={(o) => {
          if (!o) closeAdd();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Add Speaker" />
            <div className="flex flex-col gap-4">
              <TextInput
                label="Name"
                placeholder="e.g. James White"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                data-autofocus
                required
              />
              <Textarea
                label="Bio"
                placeholder="Optional"
                value={newBio}
                onChange={(e) => setNewBio(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={5}
              />
              <div className="flex flex-wrap items-center justify-end gap-4">
                <Button variant="outline" onClick={closeAdd}>
                  Cancel
                </Button>
                <Button
                  loading={createMutation.isPending}
                  disabled={newName.trim().length === 0}
                  onClick={() =>
                    createMutation.mutate({
                      channelId,
                      name: newName.trim(),
                      bio: newBio.trim() || undefined,
                    })
                  }
                >
                  Add Speaker
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Edit speaker modal */}
      <LcModal.Root
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Edit Speaker" />
            {editing ? (
              <div className="flex flex-col gap-4">
                <TextInput
                  label="Name"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.currentTarget.value })
                  }
                  data-autofocus
                  required
                />
                <Textarea
                  label="Bio"
                  value={editing.bio}
                  onChange={(e) =>
                    setEditing({ ...editing, bio: e.currentTarget.value })
                  }
                  autosize
                  minRows={2}
                  maxRows={5}
                />
                <div className="flex flex-wrap items-center justify-end gap-4">
                  <Button variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button
                    loading={updateMutation.isPending}
                    disabled={editing.name.trim().length === 0}
                    onClick={() =>
                      updateMutation.mutate({
                        channelId,
                        speakerId: editing.id,
                        name: editing.name.trim(),
                        bio: editing.bio.trim() || null,
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : null}
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
