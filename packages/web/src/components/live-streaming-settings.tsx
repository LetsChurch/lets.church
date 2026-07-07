import type { UploadLicense, UploadVisibility } from '@letschurch/db/types';
import { IconCheck, IconCopy, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  ActionIcon,
  Badge,
  Button,
  Loader,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import {
  Checkbox,
  PasswordInput,
  Select,
  Textarea,
  TextInput,
} from '@/components/ui/input';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useCopied } from '@/hooks/use-copied';
import { useTRPC } from '@/trpc/react';

const licenseOptions = [
  { value: 'STANDARD', label: 'Standard Copyright' },
  { value: 'PUBLIC_DOMAIN', label: 'Public Domain' },
  {
    group: 'Creative Commons',
    items: [
      { value: 'CC_BY', label: 'CC BY' },
      { value: 'CC_BY_SA', label: 'CC BY-SA' },
      { value: 'CC_BY_NC', label: 'CC BY-NC' },
      { value: 'CC_BY_NC_SA', label: 'CC BY-NC-SA' },
      { value: 'CC_BY_ND', label: 'CC BY-ND' },
      { value: 'CC_BY_NC_ND', label: 'CC BY-NC-ND' },
      { value: 'CC0', label: 'CC0' },
    ],
  },
];

const visibilityOptions = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'UNLISTED', label: 'Unlisted' },
];

// Shared copy control so every copyable field uses an identical button.
function CopyActionIcon({ value }: { value: string }) {
  const { copied, copy } = useCopied(1500);
  return (
    <Tooltip label={copied ? 'Copied' : 'Copy'}>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => copy(value)}
        disabled={!value}
      >
        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}

function CopyableField({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <TextInput
      label={label}
      description={description}
      value={value}
      readOnly
      rightSection={<CopyActionIcon value={value} />}
    />
  );
}

export function LiveStreamingSettings({
  channelId,
  channelSlug,
}: {
  channelId: string;
  channelSlug: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Full public live URL (/<slug>/live), resolved client-side so the copy
  // value matches wherever the app is served. Empty during SSR to avoid a
  // hydration mismatch; filled on mount.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const liveUrl = `${origin}/${channelSlug}/live`;

  const liveStreamQuery = useQuery(
    trpc.dashboard.liveStreaming.getLiveStream.queryOptions({ channelId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.liveStreaming.getLiveStream.queryKey({
        channelId,
      }),
    });

  const provisionMutation = useMutation(
    trpc.dashboard.liveStreaming.provisionLiveStream.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        showSuccess({ message: 'Live stream provisioned' });
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to provision' }),
    }),
  );

  const resetKeyMutation = useMutation(
    trpc.dashboard.liveStreaming.resetStreamKey.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        showSuccess({ message: 'Stream key reset' });
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to reset key' }),
    }),
  );

  const liveStream = liveStreamQuery.data;

  if (liveStreamQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Title order={3}>Live Streaming</Title>
        <Loader size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Title order={3}>Live Streaming</Title>

      {!liveStream ? (
        <div className="flex flex-col gap-2">
          <Text size="sm" c="dimmed">
            Provision a persistent stream key for this channel. Use it in your
            streaming encoder to go live; broadcasts are recorded and
            automatically imported as on-demand media when you stop streaming.
          </Text>
          <Button
            loading={provisionMutation.isPending}
            onClick={() => provisionMutation.mutate({ channelId })}
            className="self-start"
          >
            Enable live streaming
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Text fw={500} size="sm">
              Status
            </Text>
            <Badge
              color={liveStream.status === 'active' ? 'red' : 'gray'}
              variant={liveStream.status === 'active' ? 'filled' : 'light'}
            >
              {liveStream.status === 'active' ? 'Live' : liveStream.status}
            </Badge>
          </div>

          <CopyableField
            label="Live page link"
            description="Public page that always redirects to this channel's current or most recent broadcast — share this with viewers."
            value={liveUrl}
          />

          <CopyableField
            label="Server URL (RTMPS)"
            description="Enter this as the server/URL in your streaming encoder."
            value={liveStream.rtmpsUrl}
          />

          <div className="flex flex-nowrap items-end gap-2">
            <div className="flex-1">
              <PasswordInput
                label="Stream key"
                description="Paste this as the stream key in your encoder. Keep it secret — anyone with it can broadcast to your channel."
                value={liveStream.streamKey ?? ''}
                placeholder={
                  liveStream.streamKey ? undefined : 'Unavailable (Mux error)'
                }
                readOnly
              />
            </div>
            <CopyActionIcon value={liveStream.streamKey ?? ''} />
            <Button
              variant="default"
              loading={resetKeyMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Reset the stream key? Any encoder using the current key will stop working.',
                  )
                ) {
                  resetKeyMutation.mutate({ channelId });
                }
              }}
            >
              Reset
            </Button>
          </div>

          <NextBroadcastForm
            channelId={channelId}
            initial={{
              title: liveStream.nextTitle ?? '',
              description: liveStream.nextDescription ?? '',
              visibility: liveStream.nextVisibility ?? 'PUBLIC',
              license: liveStream.nextLicense ?? 'STANDARD',
              commentsEnabled: liveStream.nextCommentsEnabled ?? true,
              downloadsEnabled: liveStream.nextDownloadsEnabled ?? true,
              seriesId: liveStream.nextSeriesId ?? null,
            }}
          />

          <SimulcastTargets
            channelId={channelId}
            targets={liveStream.simulcastTargets}
            onChange={invalidate}
          />
        </>
      )}
    </div>
  );
}

function NextBroadcastForm({
  channelId,
  initial,
}: {
  channelId: string;
  initial: {
    title: string;
    description: string;
    visibility: string;
    license: string;
    commentsEnabled: boolean;
    downloadsEnabled: boolean;
    seriesId: string | null;
  };
}) {
  const trpc = useTRPC();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [license, setLicense] = useState(initial.license);
  const [commentsEnabled, setCommentsEnabled] = useState(
    initial.commentsEnabled,
  );
  const [downloadsEnabled, setDownloadsEnabled] = useState(
    initial.downloadsEnabled,
  );
  const [seriesId, setSeriesId] = useState<string | null>(initial.seriesId);

  // Channel series (upload lists of type SERIES) for the dropdown.
  const playlistsQuery = useQuery(
    trpc.dashboard.channels.getChannelPlaylists.queryOptions({ channelId }),
  );
  const seriesOptions = [
    { value: '', label: 'None' },
    ...(playlistsQuery.data ?? [])
      .filter((p) => p.type === 'SERIES')
      .map((p) => ({ value: p.id, label: p.title })),
  ];

  // Keep local form state in sync if the underlying query refetches.
  useEffect(() => {
    setTitle(initial.title);
    setDescription(initial.description);
    setVisibility(initial.visibility);
    setLicense(initial.license);
    setCommentsEnabled(initial.commentsEnabled);
    setDownloadsEnabled(initial.downloadsEnabled);
    setSeriesId(initial.seriesId);
  }, [
    initial.title,
    initial.description,
    initial.visibility,
    initial.license,
    initial.commentsEnabled,
    initial.downloadsEnabled,
    initial.seriesId,
  ]);

  const mutation = useMutation(
    trpc.dashboard.liveStreaming.setNextBroadcast.mutationOptions({
      onSuccess: () => showSuccess({ message: 'Next broadcast details saved' }),
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to save' }),
    }),
  );

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Text fw={500} size="sm">
        Next broadcast details
      </Text>
      <Text size="xs" c="dimmed">
        Applied to the video created when you next go live, and to its imported
        recording. You can still edit the video afterwards.
      </Text>
      <TextInput
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={3}
      />
      <Select
        label="Visibility"
        data={visibilityOptions}
        value={visibility}
        onChange={(val) => val && setVisibility(val)}
      />
      <Select
        label="License"
        data={licenseOptions}
        value={license}
        onChange={(val) => val && setLicense(val)}
      />
      <Select
        label="Series"
        data={seriesOptions}
        value={seriesId ?? ''}
        onChange={(val) => setSeriesId(val || null)}
      />
      <Checkbox
        label="Enable comments"
        checked={commentsEnabled}
        onChange={(checked) => setCommentsEnabled(checked)}
      />
      <Checkbox
        label="Enable downloads"
        checked={downloadsEnabled}
        onChange={(checked) => setDownloadsEnabled(checked)}
      />
      <Button
        className="self-start"
        loading={mutation.isPending}
        disabled={!title}
        onClick={() =>
          mutation.mutate({
            channelId,
            title,
            description,
            visibility: visibility as UploadVisibility,
            license: license as UploadLicense,
            commentsEnabled,
            downloadsEnabled,
            seriesId,
          })
        }
      >
        Save broadcast details
      </Button>
    </div>
  );
}

function SimulcastTargets({
  channelId,
  targets,
  onChange,
}: {
  channelId: string;
  targets: Array<{
    id: string;
    label: string | null;
    url: string;
    status: string;
  }>;
  onChange: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');

  const addMutation = useMutation(
    trpc.dashboard.liveStreaming.addSimulcastTarget.mutationOptions({
      onSuccess: async () => {
        setLabel('');
        setUrl('');
        setStreamKey('');
        await onChange();
        showSuccess({ message: 'Simulcast target added' });
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to add target' }),
    }),
  );

  const removeMutation = useMutation(
    trpc.dashboard.liveStreaming.removeSimulcastTarget.mutationOptions({
      onSuccess: async () => {
        await onChange();
        showSuccess({ message: 'Simulcast target removed' });
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to remove target' }),
    }),
  );

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Text fw={500} size="sm">
        Restreaming (simulcast)
      </Text>
      <Text size="xs" c="dimmed">
        Forward your broadcast to YouTube, Facebook, etc. Add or remove targets
        only while you're not live. Find the RTMP URL + key in the destination's
        live dashboard.
      </Text>

      {targets.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>URL</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {targets.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.label ?? '—'}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {t.url}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">
                    {t.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={
                      removeMutation.isPending &&
                      removeMutation.variables?.targetId === t.id
                    }
                    onClick={() =>
                      removeMutation.mutate({ channelId, targetId: t.id })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <div className="flex flex-nowrap items-end gap-2">
        <TextInput
          label="Label"
          placeholder="YouTube"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
        />
        <div className="flex-1">
          <TextInput
            label="RTMP URL"
            placeholder="rtmp://a.rtmp.youtube.com/live2"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
        </div>
        <div className="flex-1">
          <TextInput
            label="Stream key"
            value={streamKey}
            onChange={(e) => setStreamKey(e.currentTarget.value)}
          />
        </div>
        <Button
          loading={addMutation.isPending}
          disabled={!label || !url || !streamKey}
          onClick={() =>
            addMutation.mutate({ channelId, label, url, streamKey })
          }
        >
          Add
        </Button>
      </div>
    </div>
  );
}
