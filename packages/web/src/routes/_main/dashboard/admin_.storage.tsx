import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import {
  Badge,
  Button,
  Checkbox,
  Progress,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/admin_/storage')({
  component: StoragePage,
  beforeLoad: async ({ context }) => {
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser?.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        trpc.dashboard.admin.storage.listLocations.queryOptions(),
      ),
      queryClient.ensureQueryData(
        trpc.dashboard.admin.storage.listMoves.queryOptions({ limit: 50 }),
      ),
    ]);
    return {
      backNavigation: { label: 'Admin', to: '/dashboard/admin' },
    };
  },
});

// SI units, matching how caps are configured (STORAGE_*_MAX_BYTES=20TB).
function formatBytes(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  let n = Number(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function percentOf(used: string, max: string | null): number | null {
  if (max === null || Number(max) === 0) return null;
  return Math.min(100, (Number(used) / Number(max)) * 100);
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

const ACTIVE_STATUSES = new Set([
  'PENDING',
  'COPYING',
  'PAUSED',
  'GRACE',
  'CLEANING',
]);

function moveStatusBadge(status: string) {
  const color =
    status === 'COMPLETED'
      ? 'green'
      : status === 'FAILED'
        ? 'red'
        : status === 'CANCELLED'
          ? 'gray'
          : status === 'PAUSED'
            ? 'yellow'
            : 'blue';
  return <Badge color={color}>{status.toLowerCase()}</Badge>;
}

function UsageCell({
  used,
  reserved,
  max,
}: {
  used: string;
  reserved?: string;
  max: string | null;
}) {
  const total =
    reserved === undefined ? used : String(BigInt(used) + BigInt(reserved));
  const pct = percentOf(total, max);
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <Text size="sm">
        {formatBytes(used)}
        {reserved && reserved !== '0'
          ? ` + ${formatBytes(reserved)} reserved`
          : ''}{' '}
        / {max === null ? 'uncapped' : formatBytes(max)}
      </Text>
      {pct === null ? null : (
        <Progress
          value={pct}
          color={pct >= 90 ? 'red' : pct >= 75 ? 'orange' : 'blue'}
          size="sm"
        />
      )}
    </div>
  );
}

type LocationRow = {
  id: string;
  complete: boolean;
  weight: number;
  acceptingUploads: boolean;
};

function PolicyEditor({ location }: { location: LocationRow }) {
  const trpc = useTRPC();
  const [weight, setWeight] = useState(String(location.weight));
  const [accepting, setAccepting] = useState(location.acceptingUploads);
  const { refetch } = useQuery(
    trpc.dashboard.admin.storage.listLocations.queryOptions(),
  );
  const mutation = useMutation(
    trpc.dashboard.admin.storage.updatePolicy.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: `Updated ${location.id}` });
        void refetch();
      },
      onError: (err) =>
        showFailure({ message: errorMessage(err, 'Failed to update policy') }),
    }),
  );
  const parsedWeight = Number.parseInt(weight, 10);
  const dirty =
    parsedWeight !== location.weight || accepting !== location.acceptingUploads;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextInput
        label="Weight"
        type="number"
        min={0}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-20"
      />
      <Checkbox
        label="Accepting uploads"
        checked={accepting}
        onChange={setAccepting}
      />
      <Button
        size="xs"
        variant="light"
        disabled={!dirty || Number.isNaN(parsedWeight) || parsedWeight < 0}
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            locationId: location.id,
            weight: parsedWeight,
            acceptingUploads: accepting,
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

function MoveUploadForm({ locationIds }: { locationIds: string[] }) {
  const trpc = useTRPC();
  const [uploadRecordId, setUploadRecordId] = useState('');
  const [target, setTarget] = useState('');
  const [graceHours, setGraceHours] = useState('24');
  const validId = /^[0-9a-f-]{36}$/i.test(uploadRecordId.trim());
  const upload = useQuery({
    ...trpc.dashboard.admin.storage.getUploadStorage.queryOptions({
      uploadRecordId: uploadRecordId.trim(),
    }),
    enabled: validId,
    retry: false,
  });
  const mutation = useMutation(
    trpc.dashboard.admin.storage.moveUpload.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Move started' });
        setUploadRecordId('');
      },
      onError: (err) =>
        showFailure({ message: errorMessage(err, 'Failed to start move') }),
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <Title order={3}>Move an upload</Title>
      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label="Upload ID"
          value={uploadRecordId}
          onChange={(e) => setUploadRecordId(e.target.value)}
          className="w-96"
        />
        <Select
          label="Target location"
          placeholder="Choose…"
          value={target}
          onChange={setTarget}
          data={locationIds
            .filter((id) => id !== upload.data?.storageLocation)
            .map((id) => ({ value: id, label: id }))}
        />
        <TextInput
          label="Grace period (hours)"
          type="number"
          min={0}
          value={graceHours}
          onChange={(e) => setGraceHours(e.target.value)}
          className="w-32"
        />
        <Button
          disabled={!upload.data || !target || !!upload.data.storageMoveId}
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              uploadRecordId: uploadRecordId.trim(),
              targetLocation: target,
              graceHours: Number(graceHours) || 0,
            })
          }
        >
          Move
        </Button>
      </div>
      {upload.data ? (
        <Text size="sm" c="dimmed">
          “{upload.data.title ?? 'Untitled'}” is at{' '}
          <strong>{upload.data.storageLocation}</strong> — source{' '}
          {formatBytes(upload.data.uploadSizeBytes)}, artifacts{' '}
          {formatBytes(upload.data.publicSizeBytes)}
          {upload.data.storageMoveId ? ' (move in progress)' : ''}
          {upload.data.storageWaitingSince ? ' (waiting for storage)' : ''}
        </Text>
      ) : validId && upload.isError ? (
        <Text size="sm" c="red">
          Upload not found
        </Text>
      ) : null}
    </div>
  );
}

function MoveImagesForm({ locationIds }: { locationIds: string[] }) {
  const trpc = useTRPC();
  const [owner, setOwner] = useState<'APP_USER' | 'CHANNEL' | 'ORGANIZATION'>(
    'CHANNEL',
  );
  const [ownerId, setOwnerId] = useState('');
  const [target, setTarget] = useState('');
  const mutation = useMutation(
    trpc.dashboard.admin.storage.moveOwnerImages.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Image move started' });
        setOwnerId('');
      },
      onError: (err) =>
        showFailure({ message: errorMessage(err, 'Failed to start move') }),
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <Title order={3}>Move images</Title>
      <Text size="sm" c="dimmed">
        Avatars, covers and default thumbnails for one channel, organization or
        user, plus their original uploads.
      </Text>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Owner"
          value={owner}
          onChange={(v) => setOwner(v as typeof owner)}
          data={[
            { value: 'CHANNEL', label: 'Channel' },
            { value: 'ORGANIZATION', label: 'Organization' },
            { value: 'APP_USER', label: 'User' },
          ]}
        />
        <TextInput
          label="Owner ID"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-96"
        />
        <Select
          label="Target location"
          placeholder="Choose…"
          value={target}
          onChange={setTarget}
          data={locationIds.map((id) => ({ value: id, label: id }))}
        />
        <Button
          disabled={!/^[0-9a-f-]{36}$/i.test(ownerId.trim()) || !target}
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              owner,
              ownerId: ownerId.trim(),
              targetLocation: target,
              graceHours: 24,
            })
          }
        >
          Move
        </Button>
      </div>
    </div>
  );
}

type GoalType = 'bytes' | 'percent' | 'all';

function RebalanceForm({ locationIds }: { locationIds: string[] }) {
  const trpc = useTRPC();
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('bytes');
  const [goalValue, setGoalValue] = useState('');
  const [concurrency, setConcurrency] = useState('2');
  const [graceHours, setGraceHours] = useState('24');
  const [stopAccepting, setStopAccepting] = useState(false);

  const goal =
    goalType === 'all'
      ? ({ type: 'all' } as const)
      : goalType === 'percent'
        ? ({ type: 'percent', percent: Number(goalValue) } as const)
        : ({
            type: 'bytes',
            // Entered in GB.
            bytes: String(
              Math.max(0, Math.round(Number(goalValue) * 1_000_000_000)),
            ),
          } as const);
  const goalValid =
    goalType === 'all' ||
    (goalValue !== '' && Number.isFinite(Number(goalValue)));

  const preview = useQuery({
    ...trpc.dashboard.admin.storage.previewRebalance.queryOptions({
      sourceLocation: source,
      goal,
    }),
    enabled: !!source && goalValid,
    retry: false,
  });

  const { refetch: refetchMoves } = useQuery(
    trpc.dashboard.admin.storage.listMoves.queryOptions({ limit: 50 }),
  );
  const mutation = useMutation(
    trpc.dashboard.admin.storage.startRebalance.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Rebalance started' });
        void refetchMoves();
      },
      onError: (err) =>
        showFailure({
          message: errorMessage(err, 'Failed to start rebalance'),
        }),
    }),
  );

  const start = () => {
    modals.openConfirmModal({
      title: 'Start rebalance',
      children: (
        <Text size="sm">
          Move {preview.data?.records.toLocaleString() ?? 'up to'} uploads (
          {formatBytes(preview.data?.bytes)}) off <strong>{source}</strong> to{' '}
          <strong>{target || 'any accepting location'}</strong>? Source copies
          are deleted after the {graceHours}h grace period.
        </Text>
      ),
      labels: { confirm: 'Start', cancel: 'Cancel' },
      onConfirm: () =>
        mutation.mutate({
          sourceLocation: source,
          targetLocation: target || null,
          goal,
          concurrency: Number(concurrency) || 1,
          graceHours: Number(graceHours) || 0,
          stopAcceptingUploads: stopAccepting,
        }),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Title order={3}>Rebalance / drain</Title>
      <Text size="sm" c="dimmed">
        Moves uploads off a location, largest first, until the goal is met.
        Uploads that are still processing, parked or already moving are skipped.
      </Text>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="From"
          placeholder="Choose…"
          value={source}
          onChange={setSource}
          data={locationIds.map((id) => ({ value: id, label: id }))}
        />
        <Select
          label="To"
          value={target}
          onChange={setTarget}
          data={[
            { value: '', label: 'Any accepting location' },
            ...locationIds
              .filter((id) => id !== source)
              .map((id) => ({ value: id, label: id })),
          ]}
        />
        <Select
          label="Goal"
          value={goalType}
          onChange={(v) => setGoalType(v as GoalType)}
          data={[
            { value: 'bytes', label: 'Move N GB' },
            { value: 'percent', label: 'Until under N% of cap' },
            { value: 'all', label: 'Everything (drain)' },
          ]}
        />
        {goalType === 'all' ? null : (
          <TextInput
            label={goalType === 'bytes' ? 'GB' : 'Percent'}
            type="number"
            min={0}
            value={goalValue}
            onChange={(e) => setGoalValue(e.target.value)}
            className="w-28"
          />
        )}
        <TextInput
          label="Concurrent moves"
          type="number"
          min={1}
          max={16}
          value={concurrency}
          onChange={(e) => setConcurrency(e.target.value)}
          className="w-32"
        />
        <TextInput
          label="Grace period (hours)"
          type="number"
          min={0}
          value={graceHours}
          onChange={(e) => setGraceHours(e.target.value)}
          className="w-32"
        />
      </div>
      <Checkbox
        label="Stop placing new uploads at the source"
        checked={stopAccepting}
        onChange={setStopAccepting}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button
          disabled={!source || !goalValid || !preview.data}
          loading={mutation.isPending}
          onClick={start}
        >
          Start rebalance
        </Button>
        {preview.isFetching ? (
          <Text size="sm" c="dimmed">
            Planning…
          </Text>
        ) : preview.data ? (
          <Text size="sm">
            Plan: {preview.data.records.toLocaleString()} uploads,{' '}
            {formatBytes(preview.data.bytes)}
            {preview.data.goalBytes !== null &&
            BigInt(preview.data.bytes) < BigInt(preview.data.goalBytes)
              ? ` (goal ${formatBytes(preview.data.goalBytes)} not reachable)`
              : ''}
          </Text>
        ) : preview.error ? (
          <Text size="sm" c="red">
            {preview.error.message}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

function MovesTable() {
  const trpc = useTRPC();
  const { data: moves, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.storage.listMoves.queryOptions({ limit: 50 }),
    refetchInterval: (query) =>
      query.state.data?.some((m) => ACTIVE_STATUSES.has(m.status))
        ? 5000
        : false,
  });
  const control = useMutation(
    trpc.dashboard.admin.storage.controlRebalance.mutationOptions({
      onSuccess: () => void refetch(),
      onError: (err) =>
        showFailure({ message: errorMessage(err, 'Failed to signal') }),
    }),
  );

  if (moves.length === 0) {
    return <Text c="dimmed">No storage moves yet.</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={900}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Started</Table.Th>
            <Table.Th>Kind</Table.Th>
            <Table.Th>Route</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Progress</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {moves.map((move) => {
            const isRebalance = move.kind === 'REBALANCE';
            const running =
              move.status === 'COPYING' || move.status === 'PENDING';
            return (
              <Table.Tr key={move.id}>
                <Table.Td>
                  <Text size="sm">
                    {new Date(move.createdAt).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {move.kind === 'UPLOAD_RECORD'
                      ? `Upload ${move.uploadRecordId?.slice(0, 8) ?? ''}`
                      : move.kind === 'IMAGES'
                        ? `Images (${move.imageOwner?.toLowerCase()})`
                        : 'Rebalance'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {move.kind === 'IMAGES' ? '' : `${move.sourceLocation} → `}
                    {move.targetLocation ?? 'any'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <div className="flex flex-col gap-1">
                    {moveStatusBadge(move.status)}
                    {move.error ? (
                      <Text size="xs" c="red">
                        {move.error}
                      </Text>
                    ) : null}
                  </div>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {formatBytes(move.copiedBytes)}
                    {move.totalBytes !== '0'
                      ? ` / ${formatBytes(move.totalBytes)}`
                      : ''}
                    {isRebalance
                      ? ` · ${move.completedItems}/${move.totalItems} uploads${move.failedItems ? `, ${move.failedItems} failed` : ''}`
                      : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {isRebalance && (running || move.status === 'PAUSED') ? (
                    <div className="flex gap-2">
                      {move.status === 'PAUSED' ? (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            control.mutate({
                              storageMoveId: move.id,
                              action: 'resume',
                            })
                          }
                        >
                          Resume
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            control.mutate({
                              storageMoveId: move.id,
                              action: 'pause',
                            })
                          }
                        >
                          Pause
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() =>
                          control.mutate({
                            storageMoveId: move.id,
                            action: 'cancel',
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function StoragePage() {
  const trpc = useTRPC();
  const { data: locations } = useSuspenseQuery({
    ...trpc.dashboard.admin.storage.listLocations.queryOptions(),
    refetchInterval: 30_000,
  });
  const completeIds = locations.filter((l) => l.complete).map((l) => l.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Title order={1}>Storage Locations</Title>
        <Text c="dimmed">
          Each location pairs an ingest and a public bucket. Buckets,
          credentials and caps come from env; weights and whether a location
          accepts new uploads are set here.
        </Text>
      </div>

      <Table.ScrollContainer minWidth={1000}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Location</Table.Th>
              <Table.Th>Ingest</Table.Th>
              <Table.Th>Public</Table.Th>
              <Table.Th>Output ratio</Table.Th>
              <Table.Th>Policy</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {locations.map((location) => (
              <Table.Tr key={location.id}>
                <Table.Td>
                  <div className="flex flex-col gap-1">
                    <Text fw={600}>{location.id}</Text>
                    {!location.complete ? (
                      <Badge color="orange">missing a bucket</Badge>
                    ) : null}
                    {location.parkedRecords > 0 ? (
                      <Badge color="red">
                        {location.parkedRecords} waiting for storage
                      </Badge>
                    ) : null}
                    {location.movingRecords > 0 ? (
                      <Badge color="blue">
                        {location.movingRecords} moving
                      </Badge>
                    ) : null}
                  </div>
                </Table.Td>
                <Table.Td>
                  <UsageCell
                    used={location.ingest.used}
                    max={location.ingest.max}
                  />
                </Table.Td>
                <Table.Td>
                  <UsageCell
                    used={location.public.used}
                    reserved={location.public.reserved}
                    max={location.public.max}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {location.publicRatio === null
                      ? '—'
                      : `${location.publicRatio.toFixed(2)}×`}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <PolicyEditor location={location} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <MoveUploadForm locationIds={completeIds} />
      <MoveImagesForm locationIds={completeIds} />
      <RebalanceForm locationIds={completeIds} />

      <div className="flex flex-col gap-3">
        <Title order={3}>Moves</Title>
        <MovesTable />
      </div>
    </div>
  );
}
