import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  Alert,
  Button,
  Loader,
  Select,
  Text,
  TextInput,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

// SI units, matching how caps are configured (STORAGE_*_MAX_BYTES=20TB).
function formatBytes(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'unmeasured';
  let n = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Site-admin modal on the upload page: move this upload's source and
 * processed files to another storage location. Queries only run while open.
 */
export function MoveStorageModal({
  uploadId,
  open,
  onClose,
}: {
  uploadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const [target, setTarget] = useState('');
  const [graceHours, setGraceHours] = useState('24');

  const storage = useQuery({
    ...trpc.dashboard.admin.storage.getUploadStorage.queryOptions({
      uploadRecordId: uploadId,
    }),
    enabled: open,
  });
  const locations = useQuery({
    ...trpc.dashboard.admin.storage.listLocations.queryOptions(),
    enabled: open,
  });

  const move = useMutation(
    trpc.dashboard.admin.storage.moveUpload.mutationOptions({
      onSuccess: () => {
        showSuccess({
          message: `Moving to ${target}. Track it on the Storage Locations page.`,
        });
        setTarget('');
        void storage.refetch();
        onClose();
      },
      onError: (err) =>
        showFailure({
          message: err instanceof Error ? err.message : 'Failed to start move',
        }),
    }),
  );

  const current = storage.data?.storageLocation;
  const targets = (locations.data ?? []).filter(
    (l) => l.complete && l.id !== current,
  );
  const busy = !!storage.data?.storageMoveId;

  return (
    <LcModal.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="md">
          <ModalHeader title="Move storage location" />
          {storage.isPending || locations.isPending ? (
            <div className="flex justify-center py-6">
              <Loader />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Text size="sm">
                Stored at <strong>{current}</strong>: source{' '}
                {formatBytes(storage.data?.uploadSizeBytes)}, processed files{' '}
                {formatBytes(storage.data?.publicSizeBytes)}.
              </Text>
              {busy ? (
                <Alert color="blue">
                  A move is already in progress for this upload.
                </Alert>
              ) : null}
              {storage.data?.storageWaitingSince ? (
                <Alert color="orange">
                  Processing is waiting for storage capacity. Moving it to a
                  location with room lets it continue.
                </Alert>
              ) : null}
              {targets.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No other storage location is configured.
                </Text>
              ) : (
                <>
                  <Select
                    label="Target location"
                    placeholder="Choose…"
                    value={target}
                    onChange={setTarget}
                    data={targets.map((l) => ({
                      value: l.id,
                      label: l.acceptingUploads
                        ? l.id
                        : `${l.id} (not accepting new uploads)`,
                    }))}
                  />
                  <TextInput
                    label="Grace period (hours)"
                    description="The old copy is kept this long before it's deleted, so open players and cached pages keep working."
                    type="number"
                    min={0}
                    value={graceHours}
                    onChange={(e) => setGraceHours(e.target.value)}
                  />
                </>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  to="/dashboard/admin/storage"
                  className="text-brand text-sm hover:underline"
                >
                  Storage Locations
                </Link>
                <div className="flex gap-3">
                  <Button
                    variant="default"
                    onClick={onClose}
                    disabled={move.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!target || busy}
                    loading={move.isPending}
                    onClick={() =>
                      move.mutate({
                        uploadRecordId: uploadId,
                        targetLocation: target,
                        graceHours: Math.max(0, Number(graceHours) || 0),
                      })
                    }
                  >
                    Move
                  </Button>
                </div>
              </div>
            </div>
          )}
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
