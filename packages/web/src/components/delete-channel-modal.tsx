import { useState } from 'react';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { Button, Text, TextInput } from '@/components/ui';

type DeleteChannelModalProps = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  channelName: string;
  isDeleting: boolean;
};

export function DeleteChannelModal({
  opened,
  onClose,
  onConfirm,
  channelName,
  isDeleting,
}: DeleteChannelModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const isValid = confirmationText === channelName;

  const handleConfirm = () => {
    if (isValid && !isDeleting) {
      onConfirm();
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmationText('');
      onClose();
    }
  };

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
          <ModalHeader title="Delete Channel" />
          <div className="flex flex-col gap-4">
            <Text size="sm">
              This will permanently delete the channel{' '}
              <Text component="span" fw={700}>
                {channelName}
              </Text>{' '}
              and all of its uploads, including:
            </Text>

            <div className="flex flex-col gap-2.5 pl-4">
              <Text size="sm" c="dimmed">
                • All upload records and their files
              </Text>
              <Text size="sm" c="dimmed">
                • S3 objects and Glacier backups
              </Text>
              <Text size="sm" c="dimmed">
                • Search index entries
              </Text>
              <Text size="sm" c="dimmed">
                • Channel memberships and subscriptions
              </Text>
              <Text size="sm" c="dimmed">
                • Organization associations
              </Text>
            </div>

            <Text size="sm" fw={500} c="red">
              This action cannot be undone.
            </Text>

            <TextInput
              label={`Type "${channelName}" to confirm deletion`}
              placeholder={channelName}
              value={confirmationText}
              onChange={(event) =>
                setConfirmationText(event.currentTarget.value)
              }
              disabled={isDeleting}
              data-autofocus
            />

            <div className="flex flex-col gap-2.5">
              <Button
                color="red"
                onClick={handleConfirm}
                disabled={!isValid || isDeleting}
                loading={isDeleting}
                fullWidth
              >
                {isDeleting ? 'Starting Deletion...' : 'Delete Channel'}
              </Button>
              <Button
                variant="subtle"
                onClick={handleClose}
                disabled={isDeleting}
                fullWidth
              >
                Cancel
              </Button>
            </div>
          </div>
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
