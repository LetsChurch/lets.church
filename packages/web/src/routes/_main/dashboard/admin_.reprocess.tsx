import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useDeferredValue, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Text,
  TextInput,
  Title,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

// Segmented single-select control (replaces Mantine's SegmentedControl) built on
// Base UI's ToggleGroup so it stays keyboard-accessible. Single-select: clicking
// the active option is a no-op (never deselects to empty).
function SegmentedControl({
  value,
  onChange,
  data,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  data: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const v = next[0];
        if (typeof v === 'string') onChange(v);
      }}
      disabled={disabled}
      className="border-fancy-pants inline-flex w-fit items-center gap-0.5 rounded-lg bg-gray-950/5 p-0.5 dark:bg-white/5"
    >
      {data.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          className={cn(
            'rounded-md px-3 py-1 font-medium text-secondary text-xs transition-colors hover:text-primary',
            'data-[pressed]:bg-white data-[pressed]:text-primary data-[pressed]:shadow-sm dark:data-[pressed]:bg-zinc-700',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export const Route = createFileRoute('/_main/dashboard/admin_/reprocess')({
  component: ReprocessPage,
  beforeLoad: async ({ context }) => {
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser?.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getReprocessStatus.queryOptions(),
    );
    return { backNavigation: { label: 'Admin', to: '/dashboard/admin' } };
  },
});

type ProcessingScope = 'transcode' | 'transcribe' | 'everything';

const processingScopeData = [
  { value: 'transcode', label: 'Transcode' },
  { value: 'transcribe', label: 'Transcribe' },
  { value: 'everything', label: 'Everything' },
];

// `videoOnly` only makes sense when the run re-encodes media.
function transcodes(scope: ProcessingScope) {
  return scope === 'transcode' || scope === 'everything';
}

// DateInput hands back a `YYYY-MM-DD` string (or null). Widen each bound
// to a full-day UTC range and emit ISO datetimes for the API; returns
// undefined when neither bound is set so the worker skips the filter.
function toDateRange(start: string | null, end: string | null) {
  if (!start && !end) return undefined;
  return {
    start: start ? new Date(`${start}T00:00:00.000Z`).toISOString() : undefined,
    end: end ? new Date(`${end}T23:59:59.999Z`).toISOString() : undefined,
  };
}

function statusBadge(status: string | null | undefined) {
  if (!status) return <Badge color="gray">Idle</Badge>;
  if (status === 'running') return <Badge color="blue">Running</Badge>;
  if (status === 'completed') return <Badge color="green">Completed</Badge>;
  if (status === 'cancelled') return <Badge color="yellow">Cancelled</Badge>;
  if (status === 'failed') return <Badge color="red">Failed</Badge>;
  return <Badge color="gray">Idle</Badge>;
}

function ReprocessPage() {
  const trpc = useTRPC();
  const [channelSlug, setChannelSlug] = useState('');
  const deferredChannelSlug = useDeferredValue(channelSlug);

  // Defaults to `transcribe` for the no-paragraphs block — the whole
  // point of that scope is to push affected uploads through the new
  // transcribe pipeline so paragraphs land. The other blocks default
  // to `transcode` since their motivation is usually a transcode-side
  // change.
  const [noParagraphsProcessingScope, setNoParagraphsProcessingScope] =
    useState<ProcessingScope>('transcribe');
  const [channelProcessingScope, setChannelProcessingScope] =
    useState<ProcessingScope>('transcode');
  const [allProcessingScope, setAllProcessingScope] =
    useState<ProcessingScope>('transcode');

  // Skip-probe defaults on everywhere (including the migration): reuse
  // the probe captured on the first run instead of re-downloading +
  // re-probing. Falls back to a live probe per-upload when none stored.
  const [noParagraphsSkipProbe, setNoParagraphsSkipProbe] = useState(true);
  const [channelSkipProbe, setChannelSkipProbe] = useState(true);
  const [allSkipProbe, setAllSkipProbe] = useState(true);

  // Restrict a transcoding run to uploads that already have a video
  // variant (skips audio-only). Only meaningful when the run transcodes.
  // Not offered on the migration card (it's transcribe-driven).
  const [channelVideoOnly, setChannelVideoOnly] = useState(false);
  const [allVideoOnly, setAllVideoOnly] = useState(false);

  // Optional date window for the channel + all-uploads flows (the
  // migration scope is intentionally left without one).
  const [channelDateStart, setChannelDateStart] = useState<string | null>(null);
  const [channelDateEnd, setChannelDateEnd] = useState<string | null>(null);
  const [allDateStart, setAllDateStart] = useState<string | null>(null);
  const [allDateEnd, setAllDateEnd] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = useSuspenseQuery({
    ...trpc.dashboard.admin.getReprocessStatus.queryOptions(),
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      return d.noParagraphsStatus === 'running' || d.allStatus === 'running'
        ? 3000
        : false;
    },
  });

  const { data: channelStatus, refetch: refetchChannelStatus } = useQuery({
    ...trpc.dashboard.admin.getChannelReprocessStatus.queryOptions({
      channelSlug: deferredChannelSlug,
    }),
    enabled: deferredChannelSlug.length > 0,
    refetchInterval: (query) => (query.state.data === 'running' ? 3000 : false),
  });

  const startMutation = useMutation(
    trpc.dashboard.admin.startReprocess.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reprocess started' });
        refetchStatus();
        refetchChannelStatus();
      },
      onError: (err) => {
        showFailure({
          message: err instanceof Error ? err.message : 'Failed to start',
        });
      },
    }),
  );

  const cancelMutation = useMutation(
    trpc.dashboard.admin.cancelReprocess.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Reprocess cancelled' });
        refetchStatus();
        refetchChannelStatus();
      },
      onError: (err) => {
        showFailure({
          message: err instanceof Error ? err.message : 'Failed to cancel',
        });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Reprocess Media</Title>
        <Text c="dimmed">
          Re-run uploads through the current pipeline. Jobs run at lowest
          priority and won't disrupt normal uploads. When transcribing, LLM
          stages use OpenAI Batch; each sequential batch stage may take up to 24
          hours.
        </Text>
      </div>

      {/* New transcription pipeline */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Text fw={600}>New Transcription Pipeline</Text>
              <Text size="sm" c="dimmed">
                Uploads with no `transcript_paragraph` rows — they predate the
                diarization + paragraph-segmentation pipeline. Run this to bring
                them up. Scheduled newest-first so the most recent content
                catches up before backfilling older archives.
              </Text>
            </div>
            {statusBadge(status.noParagraphsStatus)}
          </div>

          <div className="flex flex-wrap items-center justify-start gap-4">
            <Text size="sm" c="dimmed">
              Remaining:
            </Text>
            <Text size="sm" fw={500}>
              {status.noParagraphsCount.toLocaleString()} uploads
            </Text>
          </div>

          <SegmentedControl
            value={noParagraphsProcessingScope}
            onChange={(v) =>
              setNoParagraphsProcessingScope(v as ProcessingScope)
            }
            data={processingScopeData}
            disabled={status.noParagraphsStatus === 'running'}
          />

          <Checkbox
            label="Skip probe (reuse stored metadata)"
            checked={noParagraphsSkipProbe}
            onChange={(checked) => setNoParagraphsSkipProbe(checked)}
            disabled={status.noParagraphsStatus === 'running'}
          />

          {status.noParagraphsStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'no_paragraphs'
              }
              onClick={() =>
                cancelMutation.mutate({ scope: { kind: 'no_paragraphs' } })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={status.noParagraphsCount === 0}
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'no_paragraphs'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'no_paragraphs' },
                  processingScope: noParagraphsProcessingScope,
                  skipProbe: noParagraphsSkipProbe,
                })
              }
            >
              {status.noParagraphsCount === 0
                ? 'All uploads have paragraphs'
                : 'Start migration'}
            </Button>
          )}
        </div>
      </div>

      {/* By channel */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Text fw={600}>By Channel</Text>
              <Text size="sm" c="dimmed">
                Reprocess all finalized uploads for a specific channel. Useful
                for testing or targeted fixes.
              </Text>
            </div>
            {channelSlug.length > 0 ? statusBadge(channelStatus) : null}
          </div>

          <TextInput
            placeholder="channel-slug"
            value={channelSlug}
            onChange={(e) => setChannelSlug(e.currentTarget.value)}
            label="Channel slug"
          />

          <SegmentedControl
            value={channelProcessingScope}
            onChange={(v) => setChannelProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={channelStatus === 'running'}
          />

          <Checkbox
            label="Skip probe (reuse stored metadata)"
            checked={channelSkipProbe}
            onChange={(checked) => setChannelSkipProbe(checked)}
            disabled={channelStatus === 'running'}
          />

          <Checkbox
            label="Only uploads with video variants"
            checked={channelVideoOnly && transcodes(channelProcessingScope)}
            onChange={(checked) => setChannelVideoOnly(checked)}
            disabled={
              channelStatus === 'running' || !transcodes(channelProcessingScope)
            }
          />

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              type="date"
              label={
                channelProcessingScope === 'everything'
                  ? 'Created after'
                  : `${channelProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} after`
              }
              placeholder="Optional"
              value={channelDateStart ?? ''}
              onChange={(e) =>
                setChannelDateStart(e.currentTarget.value || null)
              }
              disabled={channelStatus === 'running'}
            />
            <TextInput
              type="date"
              label={
                channelProcessingScope === 'everything'
                  ? 'Created before'
                  : `${channelProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} before`
              }
              placeholder="Optional"
              value={channelDateEnd ?? ''}
              onChange={(e) => setChannelDateEnd(e.currentTarget.value || null)}
              disabled={channelStatus === 'running'}
            />
          </div>

          {channelStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'channel'
              }
              onClick={() =>
                cancelMutation.mutate({
                  scope: { kind: 'channel', channelSlug: channelSlug.trim() },
                })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={channelSlug.trim().length === 0}
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'channel'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'channel', channelSlug: channelSlug.trim() },
                  processingScope: channelProcessingScope,
                  skipProbe: channelSkipProbe,
                  videoOnly:
                    channelVideoOnly && transcodes(channelProcessingScope),
                  dateRange: toDateRange(channelDateStart, channelDateEnd),
                })
              }
            >
              Start for channel
            </Button>
          )}
        </div>
      </div>

      {/* All uploads */}
      <div className="border-fancy-pants overflow-hidden rounded-xl bg-white dark:bg-zinc-900">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Text fw={600}>All Uploads</Text>
              <Text size="sm" c="dimmed">
                Reprocess every finalized upload. Use if the pipeline changes
                and a full rebuild is needed.
              </Text>
            </div>
            {statusBadge(status.allStatus)}
          </div>

          <Alert icon={<IconAlertTriangle size={16} />} color="orange">
            <Text size="sm">
              This will queue every upload in the system. It will take a very
              long time, but will not block new uploads because it is running at
              lowest priority.
            </Text>
          </Alert>

          <SegmentedControl
            value={allProcessingScope}
            onChange={(v) => setAllProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={status.allStatus === 'running'}
          />

          <Checkbox
            label="Skip probe (reuse stored metadata)"
            checked={allSkipProbe}
            onChange={(checked) => setAllSkipProbe(checked)}
            disabled={status.allStatus === 'running'}
          />

          <Checkbox
            label="Only uploads with video variants"
            checked={allVideoOnly && transcodes(allProcessingScope)}
            onChange={(checked) => setAllVideoOnly(checked)}
            disabled={
              status.allStatus === 'running' || !transcodes(allProcessingScope)
            }
          />

          <div className="grid grid-cols-2 gap-4">
            <TextInput
              type="date"
              label={
                allProcessingScope === 'everything'
                  ? 'Created after'
                  : `${allProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} after`
              }
              placeholder="Optional"
              value={allDateStart ?? ''}
              onChange={(e) => setAllDateStart(e.currentTarget.value || null)}
              disabled={status.allStatus === 'running'}
            />
            <TextInput
              type="date"
              label={
                allProcessingScope === 'everything'
                  ? 'Created before'
                  : `${allProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} before`
              }
              placeholder="Optional"
              value={allDateEnd ?? ''}
              onChange={(e) => setAllDateEnd(e.currentTarget.value || null)}
              disabled={status.allStatus === 'running'}
            />
          </div>

          {status.allStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'all'
              }
              onClick={() => cancelMutation.mutate({ scope: { kind: 'all' } })}
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              color="orange"
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'all'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'all' },
                  processingScope: allProcessingScope,
                  skipProbe: allSkipProbe,
                  videoOnly: allVideoOnly && transcodes(allProcessingScope),
                  dateRange: toDateRange(allDateStart, allDateEnd),
                })
              }
            >
              Start full reprocess
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
