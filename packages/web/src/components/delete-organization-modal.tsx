import { useState } from 'react';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { Button, Text, TextInput } from '@/components/ui';

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
    <LcModal.Root
      open={opened}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="md">
          <ModalHeader title={`Delete ${typeLabel}`} />
          <div className="flex flex-col gap-4">
            <Text size="sm">
              This will permanently delete the {typeLabel.toLowerCase()}{' '}
              <Text component="span" fw={700}>
                {organizationName}
              </Text>
              , including:
            </Text>

            <div className="flex flex-col gap-2.5 pl-4">
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
            </div>

            <Text size="sm" fw={500} c="red">
              This action cannot be undone.
            </Text>

            <TextInput
              label={`Type "${organizationName}" to confirm deletion`}
              placeholder={organizationName}
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
            </div>
          </div>
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
