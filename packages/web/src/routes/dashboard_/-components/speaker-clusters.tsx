import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Pagination,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { usePaged } from './use-paged';

const PAGE_SIZE = 10;

export type ClusterMemberRow = {
  uploadId: string;
  uploadTitle: string | null;
  speakerLabel: string;
  sampleText: string;
  startSeconds: number;
  paragraphCount: number;
};

export type ClusterRow = {
  channelId: string;
  channelName: string;
  cohesionPercent: number;
  members: ClusterMemberRow[];
};

export type ClusterCreate = { uploadId: string; speakerLabel: string };

function prettyLabel(label: string): string {
  const m = /^SPEAKER_?0*(\d+)$/i.exec(label);
  return m ? `Speaker ${Number(m[1]) + 1}` : label;
}

function formatTimestamp(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function memberKey(m: ClusterMemberRow): string {
  return `${m.uploadId}:${m.speakerLabel}`;
}

// One cluster of mutually-similar unlabeled segments. Pick which members belong,
// name the voice, and create a speaker + attribute them all in one action.
function ClusterCard({
  cluster,
  onCreate,
  isWorking,
  showChannel,
}: {
  cluster: ClusterRow;
  onCreate: (
    channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  isWorking: boolean;
  showChannel?: boolean;
}) {
  const [name, setName] = useState('');
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(cluster.members.map(memberKey)),
  );

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selected = cluster.members.filter((m) => checked.has(memberKey(m)));
  const canCreate = name.trim().length > 0 && selected.length > 0 && !isWorking;

  const create = () =>
    onCreate(
      cluster.channelId,
      name.trim(),
      selected.map((m) => ({
        uploadId: m.uploadId,
        speakerLabel: m.speakerLabel,
      })),
    );

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge variant="light" color="grape">
            {cluster.members.length === 1
              ? '1 segment'
              : `${cluster.members.length} segments`}
          </Badge>
          {cluster.members.length > 1 ? (
            <Text size="xs" c="dimmed">
              {cluster.cohesionPercent}% similar
            </Text>
          ) : null}
          {showChannel ? (
            <Text size="xs" c="dimmed">
              · {cluster.channelName}
            </Text>
          ) : null}
        </Group>
      </Group>

      <Stack gap={6} mb="md">
        {cluster.members.map((m) => {
          const key = memberKey(m);
          return (
            <Group key={key} gap="xs" wrap="nowrap" align="flex-start">
              <Checkbox
                checked={checked.has(key)}
                onChange={() => toggle(key)}
                mt={2}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap={6} wrap="nowrap">
                  <Link
                    to="/dashboard/channels/$channelId/uploads/$uploadId"
                    params={{
                      channelId: cluster.channelId,
                      uploadId: m.uploadId,
                    }}
                    style={{ textDecoration: 'none' }}
                  >
                    <Text size="sm" c="blue" span>
                      {m.uploadTitle ?? 'Untitled'}
                    </Text>
                  </Link>
                  <Text size="xs" c="dimmed">
                    {prettyLabel(m.speakerLabel)} · {m.paragraphCount} paras ·{' '}
                    {formatTimestamp(m.startSeconds)}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {m.sampleText}
                </Text>
              </div>
            </Group>
          );
        })}
      </Stack>

      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput
          label="Name this speaker"
          placeholder="e.g. Guest reader"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) create();
          }}
          style={{ flex: 1, maxWidth: 320 }}
          size="sm"
        />
        <Button onClick={create} disabled={!canCreate} loading={isWorking}>
          Create & assign {selected.length}
        </Button>
      </Group>
    </Card>
  );
}

// Unknown speakers: UNLABELED voices that don't match any existing speaker.
// Recurring voices are grouped (name once, mass-attribute); a one-off voice is
// its own 1-member card. Either way, name it and attribute the selected members.
export function SpeakerClusters({
  clusters,
  onCreate,
  isWorking,
  showChannel = false,
}: {
  clusters: ClusterRow[];
  onCreate: (
    channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  isWorking: boolean;
  showChannel?: boolean;
}) {
  const paged = usePaged(clusters, PAGE_SIZE);

  if (clusters.length === 0) {
    return (
      <Text c="dimmed">
        No unknown speakers to label. Diarized voices that don't match an
        existing speaker show up here — recurring voices grouped together,
        one-off voices on their own — so you can name them.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      {paged.slice.map((c) => (
        <ClusterCard
          key={`${c.channelId}:${c.members[0]?.uploadId}:${c.members[0]?.speakerLabel}`}
          cluster={c}
          onCreate={onCreate}
          isWorking={isWorking}
          showChannel={showChannel}
        />
      ))}
      {paged.pageCount > 1 ? (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {clusters.length} groups
          </Text>
          <Pagination
            total={paged.pageCount}
            value={paged.page}
            onChange={paged.setPage}
            size="sm"
          />
        </Group>
      ) : null}
    </Stack>
  );
}
