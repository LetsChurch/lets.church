import { Link } from '@tanstack/react-router';

import {
  MediaPreviewGroup,
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import { Badge, Button, Pagination, Table, Text, Title } from '@/components/ui';

import { usePaged } from './use-paged';

const PAGE_SIZE = 25;

export type AppearanceRow = {
  speakerId: string;
  speakerName: string;
  uploadId: string;
  uploadTitle: string | null;
  channelId: string;
  channelName: string;
  speakerLabel: string;
  matchPercent: number;
  sampleText: string;
  startSeconds: number;
  requested: boolean;
};

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
  return 'yellow';
}

// "Appearances elsewhere": this channel's speakers, voice-matched to untagged
// segments on OTHER channels' uploads. You can't tag another channel's content
// directly, so each row offers a "Request tagging" request the content channel
// approves.
export function SpeakerAppearances({
  appearances,
  onRequest,
  isRequesting,
}: {
  appearances: AppearanceRow[];
  onRequest: (
    speakerId: string,
    uploadId: string,
    speakerLabel: string,
  ) => Promise<void> | void;
  isRequesting: boolean;
}) {
  const paged = usePaged(appearances, PAGE_SIZE);

  if (appearances.length === 0) {
    return (
      <Text c="dimmed">
        None of your speakers were found untagged on other channels. When one of
        your speakers' voices matches an untagged segment elsewhere, it shows up
        here so you can ask that channel to tag them.
      </Text>
    );
  }

  // Group only the current page; a speaker may span pages, which is fine.
  const bySpeaker = new Map<string, AppearanceRow[]>();
  for (const a of paged.slice) {
    const list = bySpeaker.get(a.speakerId);
    if (list) list.push(a);
    else bySpeaker.set(a.speakerId, [a]);
  }

  return (
    <MediaPreviewGroup>
      <div className="flex flex-col gap-8">
        {[...bySpeaker.values()].map((rows) => {
          const first = rows[0] as AppearanceRow;
          return (
            <div key={first.speakerId}>
              <Title order={4} className="mb-2.5">
                {first.speakerName}
              </Title>
              <MediaPreviewScope side="right" sideOffset={12}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 80 }}>Match</Table.Th>
                      <Table.Th>Channel</Table.Th>
                      <Table.Th>Upload</Table.Th>
                      <Table.Th>Segment</Table.Th>
                      <Table.Th style={{ width: 160 }}>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((a) => (
                      <Table.Tr key={`${a.uploadId}:${a.speakerLabel}`}>
                        <Table.Td>
                          <Badge
                            color={confidenceColor(a.matchPercent)}
                            variant="light"
                          >
                            {a.matchPercent}%
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{a.channelName}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Link
                            to="/dashboard/channels/$channelId/uploads/$uploadId"
                            params={{
                              channelId: a.channelId,
                              uploadId: a.uploadId,
                            }}
                            style={{ textDecoration: 'none' }}
                          >
                            <Text size="sm" c="blue" span>
                              {a.uploadTitle ?? 'Untitled'}
                            </Text>
                          </Link>
                        </Table.Td>
                        <Table.Td>
                          <MediaPreviewTarget
                            mediaId={a.uploadId}
                            startSeconds={a.startSeconds}
                            title={a.uploadTitle}
                            className="block text-inherit no-underline"
                          >
                            <Text size="xs" c="dimmed">
                              {prettyLabel(a.speakerLabel)} ·{' '}
                              {formatTimestamp(a.startSeconds)}
                            </Text>
                            <Text
                              size="sm"
                              lineClamp={1}
                              className="max-w-[360px]"
                            >
                              {a.sampleText}
                            </Text>
                          </MediaPreviewTarget>
                        </Table.Td>
                        <Table.Td>
                          {a.requested ? (
                            <Badge variant="light" color="gray">
                              Requested
                            </Badge>
                          ) : (
                            <Button
                              size="xs"
                              variant="light"
                              disabled={isRequesting}
                              onClick={() =>
                                onRequest(
                                  a.speakerId,
                                  a.uploadId,
                                  a.speakerLabel,
                                )
                              }
                            >
                              Request tagging
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </MediaPreviewScope>
            </div>
          );
        })}
        {paged.pageCount > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text size="xs" c="dimmed">
              {appearances.length} appearances
            </Text>
            <Pagination
              total={paged.pageCount}
              value={paged.page}
              onChange={paged.setPage}
              size="sm"
            />
          </div>
        ) : null}
      </div>
    </MediaPreviewGroup>
  );
}
