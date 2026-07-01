import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Pagination,
  Slider,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconChevronDown, IconWand } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  MediaPreviewGroup,
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import { usePaged } from './use-paged';

const PAGE_SIZE = 25;

export type QueueMatch = {
  speakerId: string;
  name: string;
  channelId: string;
  channelName: string;
  matchPercent: number;
};

export type QueueRow = {
  uploadId: string;
  uploadTitle: string | null;
  channelId: string;
  channelName: string;
  speakerLabel: string;
  sampleText: string;
  startSeconds: number;
  paragraphCount: number;
  topMatch: QueueMatch;
  alternatives: QueueMatch[];
};

export type QueueAssignment = {
  uploadId: string;
  speakerLabel: string;
  speakerId: string;
};

// "SPEAKER_00" → "Speaker 1"; custom labels pass through unchanged.
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

function confidenceColor(pct: number): string {
  if (pct >= 90) return 'teal';
  if (pct >= 80) return 'green';
  if (pct >= 75) return 'yellow';
  return 'orange';
}

// Shared table for the per-channel and site-admin labeling queues. Lists
// unlabeled (upload, diarization-label) segments that voice-match a named
// speaker, descending by confidence, with a threshold slider + bulk assign and
// per-row assign (top match or an alternative). `onAssign` persists; the parent
// refetches so assigned rows fall off.
export function SpeakerLabelingQueue({
  queue,
  onAssign,
  isAssigning,
  showChannel = false,
}: {
  queue: QueueRow[];
  onAssign: (assignments: QueueAssignment[]) => Promise<void> | void;
  isAssigning: boolean;
  showChannel?: boolean;
}) {
  const [threshold, setThreshold] = useState(80);
  const visible = useMemo(
    () => queue.filter((r) => r.topMatch.matchPercent >= threshold),
    [queue, threshold],
  );

  const assignTop = (rows: QueueRow[]) =>
    onAssign(
      rows.map((r) => ({
        uploadId: r.uploadId,
        speakerLabel: r.speakerLabel,
        speakerId: r.topMatch.speakerId,
      })),
    );

  // Display-only pagination over the filtered set; bulk assign still acts on the
  // full `visible` list, not just the page.
  const paged = usePaged(visible, PAGE_SIZE);

  if (queue.length === 0) {
    return (
      <Text c="dimmed">
        No unlabeled segments with a confident voice match. New matches appear
        here as more speakers get labeled.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
          <Text size="sm" fw={500} mb={4}>
            Minimum confidence: {threshold}%
          </Text>
          <Slider
            min={70}
            max={100}
            value={threshold}
            onChange={setThreshold}
            marks={[
              { value: 70, label: '70' },
              { value: 80, label: '80' },
              { value: 90, label: '90' },
              { value: 100, label: '100' },
            ]}
          />
        </div>
        <Button
          leftSection={<IconWand size={16} />}
          disabled={visible.length === 0 || isAssigning}
          loading={isAssigning}
          onClick={() => assignTop(visible)}
        >
          Assign {visible.length} match{visible.length === 1 ? '' : 'es'} ≥{' '}
          {threshold}%
        </Button>
      </Group>

      <MediaPreviewGroup>
        <MediaPreviewScope side="right" sideOffset={12}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={80}>Match</Table.Th>
                <Table.Th>Speaker</Table.Th>
                <Table.Th>Upload</Table.Th>
                <Table.Th>Segment</Table.Th>
                <Table.Th w={150}>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.slice.map((r) => (
                <Table.Tr key={`${r.uploadId}:${r.speakerLabel}`}>
                  <Table.Td>
                    <Badge
                      color={confidenceColor(r.topMatch.matchPercent)}
                      variant="light"
                    >
                      {r.topMatch.matchPercent}%
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {r.topMatch.name}
                    </Text>
                    {showChannel ? (
                      <Text size="xs" c="dimmed">
                        {r.topMatch.channelName}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Link
                      to="/dashboard/channels/$channelId/uploads/$uploadId"
                      params={{ channelId: r.channelId, uploadId: r.uploadId }}
                      style={{ textDecoration: 'none' }}
                    >
                      <Text size="sm" c="blue" span>
                        {r.uploadTitle ?? 'Untitled'}
                      </Text>
                    </Link>
                    {showChannel ? (
                      <Text size="xs" c="dimmed">
                        {r.channelName}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <MediaPreviewTarget
                      mediaId={r.uploadId}
                      startSeconds={r.startSeconds}
                      title={r.uploadTitle}
                      className="block text-inherit no-underline"
                    >
                      <Text size="xs" c="dimmed">
                        {prettyLabel(r.speakerLabel)} · {r.paragraphCount} paras
                        · {formatTimestamp(r.startSeconds)}
                      </Text>
                      <Text size="sm" lineClamp={2} maw={420}>
                        {r.sampleText}
                      </Text>
                    </MediaPreviewTarget>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Button
                        size="compact-sm"
                        variant="light"
                        disabled={isAssigning}
                        onClick={() => assignTop([r])}
                      >
                        Assign
                      </Button>
                      {r.alternatives.length > 0 ? (
                        <Menu position="bottom-end" withinPortal shadow="md">
                          <Menu.Target>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              disabled={isAssigning}
                              aria-label="Other matches"
                            >
                              <IconChevronDown size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Label>Assign a different match</Menu.Label>
                            {r.alternatives.map((alt) => (
                              <Menu.Item
                                key={alt.speakerId}
                                onClick={() =>
                                  onAssign([
                                    {
                                      uploadId: r.uploadId,
                                      speakerLabel: r.speakerLabel,
                                      speakerId: alt.speakerId,
                                    },
                                  ])
                                }
                              >
                                {alt.name} · {alt.matchPercent}%
                                {showChannel ? ` (${alt.channelName})` : ''}
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </MediaPreviewScope>
      </MediaPreviewGroup>

      {paged.pageCount > 1 ? (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {visible.length} matches
          </Text>
          <Pagination
            total={paged.pageCount}
            value={paged.page}
            onChange={paged.setPage}
            size="sm"
          />
        </Group>
      ) : null}

      {visible.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          No matches at ≥ {threshold}%. Lower the threshold to see more.
        </Text>
      ) : null}
    </Stack>
  );
}
