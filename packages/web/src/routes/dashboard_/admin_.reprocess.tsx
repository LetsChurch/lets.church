import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useDeferredValue, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/reprocess')({
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
  // Split audio is produced during transcode, so this block defaults to
  // `transcode`.
  const [noSplitAudioProcessingScope, setNoSplitAudioProcessingScope] =
    useState<ProcessingScope>('transcode');
  const [channelProcessingScope, setChannelProcessingScope] =
    useState<ProcessingScope>('transcode');
  const [allProcessingScope, setAllProcessingScope] =
    useState<ProcessingScope>('transcode');

  // Per-card toggle for OpenAI Batch API mode. When checked, each
  // group of 100 uploads' LLM stages (summarize/annotate/embed)
  // submit via the Batch API at 50% cost with a ~24h SLA; live
  // path otherwise. Only meaningful for scopes that include
  // transcribe.
  // Batch defaults ON for the mass-reprocess flows (the migration and
  // all-uploads) where the 50% cost saving matters most; the targeted
  // by-channel flow defaults OFF.
  const [noParagraphsViaBatch, setNoParagraphsViaBatch] = useState(true);
  // Transcode-driven flow; batch only matters for transcribe scopes.
  const [noSplitAudioViaBatch, setNoSplitAudioViaBatch] = useState(false);
  const [channelViaBatch, setChannelViaBatch] = useState(false);
  const [allViaBatch, setAllViaBatch] = useState(true);

  // Skip-probe defaults on everywhere (including the migration): reuse
  // the probe captured on the first run instead of re-downloading +
  // re-probing. Falls back to a live probe per-upload when none stored.
  const [noParagraphsSkipProbe, setNoParagraphsSkipProbe] = useState(true);
  const [noSplitAudioSkipProbe, setNoSplitAudioSkipProbe] = useState(true);
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
      return d.noParagraphsStatus === 'running' ||
        d.noSplitAudioStatus === 'running' ||
        d.allStatus === 'running'
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
    <Stack gap="lg">
      <div>
        <Title order={1}>Reprocess Media</Title>
        <Text c="dimmed">
          Re-run uploads through the current pipeline. Jobs run at lowest
          priority and won't disrupt normal uploads.
        </Text>
      </div>

      {/* New transcription pipeline */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
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
          </Group>

          <Group>
            <Text size="sm" c="dimmed">
              Remaining:
            </Text>
            <Text size="sm" fw={500}>
              {status.noParagraphsCount.toLocaleString()} uploads
            </Text>
          </Group>

          <SegmentedControl
            size="xs"
            value={noParagraphsProcessingScope}
            onChange={(v) =>
              setNoParagraphsProcessingScope(v as ProcessingScope)
            }
            data={processingScopeData}
            disabled={status.noParagraphsStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Use OpenAI Batch API (50% cost, ~24h SLA per group of 100)"
            checked={noParagraphsViaBatch}
            onChange={(e) => setNoParagraphsViaBatch(e.currentTarget.checked)}
            disabled={
              status.noParagraphsStatus === 'running' ||
              noParagraphsProcessingScope === 'transcode'
            }
          />

          <Checkbox
            size="xs"
            label="Skip probe (reuse stored metadata)"
            checked={noParagraphsSkipProbe}
            onChange={(e) => setNoParagraphsSkipProbe(e.currentTarget.checked)}
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
                  viaBatch: noParagraphsViaBatch,
                  skipProbe: noParagraphsSkipProbe,
                })
              }
            >
              {status.noParagraphsCount === 0
                ? 'All uploads have paragraphs'
                : 'Start migration'}
            </Button>
          )}
        </Stack>
      </Card>

      {/* Split audio migration */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>Split Audio</Text>
              <Text size="sm" c="dimmed">
                Video uploads whose audio is still muxed into the video segments
                — they predate the split-audio transcode pipeline (which serves
                audio as a separate fMP4 rendition). Run a transcode to give
                them a split-audio rendition. Audio-only uploads are excluded.
              </Text>
            </div>
            {statusBadge(status.noSplitAudioStatus)}
          </Group>

          <Group>
            <Text size="sm" c="dimmed">
              Remaining:
            </Text>
            <Text size="sm" fw={500}>
              {status.noSplitAudioCount.toLocaleString()} uploads
            </Text>
          </Group>

          <SegmentedControl
            size="xs"
            value={noSplitAudioProcessingScope}
            onChange={(v) =>
              setNoSplitAudioProcessingScope(v as ProcessingScope)
            }
            data={processingScopeData}
            disabled={status.noSplitAudioStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Use OpenAI Batch API (50% cost, ~24h SLA per group of 100)"
            checked={noSplitAudioViaBatch}
            onChange={(e) => setNoSplitAudioViaBatch(e.currentTarget.checked)}
            disabled={
              status.noSplitAudioStatus === 'running' ||
              noSplitAudioProcessingScope === 'transcode'
            }
          />

          <Checkbox
            size="xs"
            label="Skip probe (reuse stored metadata)"
            checked={noSplitAudioSkipProbe}
            onChange={(e) => setNoSplitAudioSkipProbe(e.currentTarget.checked)}
            disabled={status.noSplitAudioStatus === 'running'}
          />

          {status.noSplitAudioStatus === 'running' ? (
            <Button
              size="xs"
              color="red"
              variant="light"
              loading={
                cancelMutation.isPending &&
                cancelMutation.variables?.scope.kind === 'no_split_audio'
              }
              onClick={() =>
                cancelMutation.mutate({ scope: { kind: 'no_split_audio' } })
              }
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={status.noSplitAudioCount === 0}
              loading={
                startMutation.isPending &&
                startMutation.variables?.scope.kind === 'no_split_audio'
              }
              onClick={() =>
                startMutation.mutate({
                  scope: { kind: 'no_split_audio' },
                  processingScope: noSplitAudioProcessingScope,
                  viaBatch: noSplitAudioViaBatch,
                  skipProbe: noSplitAudioSkipProbe,
                })
              }
            >
              {status.noSplitAudioCount === 0
                ? 'All video uploads have split audio'
                : 'Start migration'}
            </Button>
          )}
        </Stack>
      </Card>

      {/* By channel */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>By Channel</Text>
              <Text size="sm" c="dimmed">
                Reprocess all finalized uploads for a specific channel. Useful
                for testing or targeted fixes.
              </Text>
            </div>
            {channelSlug.length > 0 ? statusBadge(channelStatus) : null}
          </Group>

          <TextInput
            placeholder="channel-slug"
            value={channelSlug}
            onChange={(e) => setChannelSlug(e.currentTarget.value)}
            label="Channel slug"
          />

          <SegmentedControl
            size="xs"
            value={channelProcessingScope}
            onChange={(v) => setChannelProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={channelStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Use OpenAI Batch API (50% cost, ~24h SLA per group of 100)"
            checked={channelViaBatch}
            onChange={(e) => setChannelViaBatch(e.currentTarget.checked)}
            disabled={
              channelStatus === 'running' ||
              channelProcessingScope === 'transcode'
            }
          />

          <Checkbox
            size="xs"
            label="Skip probe (reuse stored metadata)"
            checked={channelSkipProbe}
            onChange={(e) => setChannelSkipProbe(e.currentTarget.checked)}
            disabled={channelStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Only uploads with video variants"
            checked={channelVideoOnly && transcodes(channelProcessingScope)}
            onChange={(e) => setChannelVideoOnly(e.currentTarget.checked)}
            disabled={
              channelStatus === 'running' || !transcodes(channelProcessingScope)
            }
          />

          <Group grow>
            <DateInput
              size="xs"
              clearable
              label={
                channelProcessingScope === 'everything'
                  ? 'Created after'
                  : `${channelProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} after`
              }
              placeholder="Optional"
              value={channelDateStart}
              onChange={setChannelDateStart}
              disabled={channelStatus === 'running'}
            />
            <DateInput
              size="xs"
              clearable
              label={
                channelProcessingScope === 'everything'
                  ? 'Created before'
                  : `${channelProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} before`
              }
              placeholder="Optional"
              value={channelDateEnd}
              onChange={setChannelDateEnd}
              disabled={channelStatus === 'running'}
            />
          </Group>

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
                  viaBatch: channelViaBatch,
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
        </Stack>
      </Card>

      {/* All uploads */}
      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>All Uploads</Text>
              <Text size="sm" c="dimmed">
                Reprocess every finalized upload. Use if the pipeline changes
                and a full rebuild is needed.
              </Text>
            </div>
            {statusBadge(status.allStatus)}
          </Group>

          <Alert icon={<IconAlertTriangle size={16} />} color="orange">
            <Text size="sm">
              This will queue every upload in the system. It will take a very
              long time, but will not block new uploads because it is running at
              lowest priority.
            </Text>
          </Alert>

          <SegmentedControl
            size="xs"
            value={allProcessingScope}
            onChange={(v) => setAllProcessingScope(v as ProcessingScope)}
            data={processingScopeData}
            disabled={status.allStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Use OpenAI Batch API (50% cost, ~24h SLA per group of 100)"
            checked={allViaBatch}
            onChange={(e) => setAllViaBatch(e.currentTarget.checked)}
            disabled={
              status.allStatus === 'running' ||
              allProcessingScope === 'transcode'
            }
          />

          <Checkbox
            size="xs"
            label="Skip probe (reuse stored metadata)"
            checked={allSkipProbe}
            onChange={(e) => setAllSkipProbe(e.currentTarget.checked)}
            disabled={status.allStatus === 'running'}
          />

          <Checkbox
            size="xs"
            label="Only uploads with video variants"
            checked={allVideoOnly && transcodes(allProcessingScope)}
            onChange={(e) => setAllVideoOnly(e.currentTarget.checked)}
            disabled={
              status.allStatus === 'running' || !transcodes(allProcessingScope)
            }
          />

          <Group grow>
            <DateInput
              size="xs"
              clearable
              label={
                allProcessingScope === 'everything'
                  ? 'Created after'
                  : `${allProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} after`
              }
              placeholder="Optional"
              value={allDateStart}
              onChange={setAllDateStart}
              disabled={status.allStatus === 'running'}
            />
            <DateInput
              size="xs"
              clearable
              label={
                allProcessingScope === 'everything'
                  ? 'Created before'
                  : `${allProcessingScope === 'transcribe' ? 'Transcribed' : 'Transcoded'} before`
              }
              placeholder="Optional"
              value={allDateEnd}
              onChange={setAllDateEnd}
              disabled={status.allStatus === 'running'}
            />
          </Group>

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
                  viaBatch: allViaBatch,
                  skipProbe: allSkipProbe,
                  videoOnly: allVideoOnly && transcodes(allProcessingScope),
                  dateRange: toDateRange(allDateStart, allDateEnd),
                })
              }
            >
              Start full reprocess
            </Button>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
