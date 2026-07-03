import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { Alert, Button, Text } from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
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
    <LcModal.Root
      open={opened}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="md">
          <ModalHeader title={`Merge ${source?.name ?? 'speaker'}`} />
          {source ? (
            target ? (
              <div className="flex flex-col gap-4">
                <Alert
                  variant="light"
                  color="red"
                  icon={<IconAlertTriangle size={18} />}
                >
                  <Text size="sm">
                    Move every attribution, link, and tag request from{' '}
                    <strong>{source.name}</strong> ({source.channelName}) onto{' '}
                    <strong>{target.name}</strong> ({target.channelName}), then
                    permanently delete <strong>{source.name}</strong>. This
                    can't be undone.
                  </Text>
                </Alert>
                <div className="flex flex-wrap items-center justify-between gap-4">
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
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Text size="sm" c="dimmed">
                  Choose the speaker to merge <strong>{source.name}</strong>{' '}
                  into. Its attributions move to the one you pick.
                </Text>
                <SpeakerPicker
                  excludeId={source.id}
                  onPickExisting={setTarget}
                  autoFocus
                  placeholder="Search for the speaker to keep…"
                />
              </div>
            )
          ) : null}
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
