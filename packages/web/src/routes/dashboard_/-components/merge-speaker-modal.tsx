import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../../-mantine';
import { type PickedSpeaker, SpeakerPicker } from './speaker-picker';

export type MergeSource = {
  id: string;
  name: string;
  channelName: string;
};

// Pick a target speaker, then confirm merging `source` into it: all of the
// source's attributions/links/tag requests move to the target and the source is
// permanently deleted.
export function MergeSpeakerModal({
  source,
  opened,
  onClose,
}: {
  source: MergeSource | null;
  opened: boolean;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<PickedSpeaker | null>(null);

  const handleClose = () => {
    setTarget(null);
    onClose();
  };

  const mergeMutation = useMutation(
    trpc.dashboard.admin.mergeSpeakers.mutationOptions({
      onSuccess: async (res) => {
        showSuccess({
          message: `Merged ${source?.name} into ${target?.name}. Re-indexing ${res.uploads} upload${
            res.uploads === 1 ? '' : 's'
          }.`,
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getAllSpeakers.queryKey(),
        });
        handleClose();
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to merge speakers' }),
    }),
  );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Merge ${source?.name ?? 'speaker'}`}
      size="md"
    >
      {source ? (
        target ? (
          <Stack gap="md">
            <Alert
              variant="light"
              color="red"
              icon={<IconAlertTriangle size={18} />}
            >
              <Text size="sm">
                Move every attribution, link, and tag request from{' '}
                <strong>{source.name}</strong> ({source.channelName}) onto{' '}
                <strong>{target.name}</strong> ({target.channelName}), then
                permanently delete <strong>{source.name}</strong>. This can't be
                undone.
              </Text>
            </Alert>
            <Group justify="space-between">
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => setTarget(null)}
                disabled={mergeMutation.isPending}
              >
                Pick a different speaker
              </Button>
              <Button
                color="red"
                loading={mergeMutation.isPending}
                onClick={() =>
                  mergeMutation.mutate({
                    sourceId: source.id,
                    targetId: target.speakerId,
                  })
                }
              >
                Merge
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Choose the speaker to merge <strong>{source.name}</strong> into.
              Its attributions move to the one you pick.
            </Text>
            <SpeakerPicker
              excludeId={source.id}
              onPickExisting={setTarget}
              autoFocus
              placeholder="Search for the speaker to keep…"
            />
          </Stack>
        )
      ) : null}
    </Modal>
  );
}
