import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

type DeleteOrganizationModalProps = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  organizationName: string;
  organizationType: 'CHURCH' | 'MINISTRY';
  isDeleting: boolean;
};

export function DeleteOrganizationModal({
  opened,
  onClose,
  onConfirm,
  organizationName,
  organizationType,
  isDeleting,
}: DeleteOrganizationModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const isValid = confirmationText === organizationName;
  const typeLabel = organizationType === 'CHURCH' ? 'Church' : 'Ministry';

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
      title={`Delete ${typeLabel}`}
      centered
      closeOnClickOutside={!isDeleting}
      closeOnEscape={!isDeleting}
      withCloseButton={!isDeleting}
    >
      <Stack gap="md">
        <Text size="sm">
          This will permanently delete the {typeLabel.toLowerCase()}{' '}
          <Text component="span" fw={700}>
            {organizationName}
          </Text>
          , including:
        </Text>

        <Stack gap="xs" pl="md">
          <Text size="sm" c="dimmed">
            • All memberships
          </Text>
          <Text size="sm" c="dimmed">
            • Channel associations
          </Text>
          <Text size="sm" c="dimmed">
            • Addresses and geocoding data
          </Text>
          <Text size="sm" c="dimmed">
            • Tags and leaders
          </Text>
          <Text size="sm" c="dimmed">
            • Search index entries
          </Text>
        </Stack>

        <Text size="sm" fw={500} c="red">
          This action cannot be undone.
        </Text>

        <TextInput
          label={`Type "${organizationName}" to confirm deletion`}
          placeholder={organizationName}
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
            {isDeleting ? 'Deleting...' : `Delete ${typeLabel}`}
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
