import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

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
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Delete Channel"
      centered
      closeOnClickOutside={!isDeleting}
      closeOnEscape={!isDeleting}
      withCloseButton={!isDeleting}
    >
      <Stack gap="md">
        <Text size="sm">
          This will permanently delete the channel{' '}
          <Text component="span" fw={700}>
            {channelName}
          </Text>{' '}
          and all of its uploads, including:
        </Text>

        <Stack gap="xs" pl="md">
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
        </Stack>

        <Text size="sm" fw={500} c="red">
          This action cannot be undone.
        </Text>

        <TextInput
          label={`Type "${channelName}" to confirm deletion`}
          placeholder={channelName}
          value={confirmationText}
          onChange={(event) => setConfirmationText(event.currentTarget.value)}
          disabled={isDeleting}
          data-autofocus
        />

        <Stack gap="xs">
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
        </Stack>
      </Stack>
    </Modal>
  );
}
