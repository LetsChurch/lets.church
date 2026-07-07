import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  MediaPreviewGroup,
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import {
  Badge,
  Button,
  Checkbox,
  Pagination,
  Text,
  TextInput,
} from '@/components/ui';

import { SpeakerPicker } from './speaker-picker';
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
// then either name a new voice (create + attribute) or — when `onAssignExisting`
// is provided — attribute them to an existing speaker, all in one action.
function ClusterCard({
  cluster,
  onCreate,
  onAssignExisting,
  isWorking,
  isAssigning = false,
  showChannel,
}: {
  cluster: ClusterRow;
  onCreate: (
    channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  onAssignExisting?: (
    speakerId: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  isWorking: boolean;
  isAssigning?: boolean;
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
  const selectedMembers = selected.map((m) => ({
    uploadId: m.uploadId,
    speakerLabel: m.speakerLabel,
  }));
  const busy = isWorking || isAssigning;
  const canCreate = name.trim().length > 0 && selected.length > 0 && !busy;

  const create = () =>
    onCreate(cluster.channelId, name.trim(), selectedMembers);

  return (
    <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-4 dark:bg-zinc-900">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-start gap-2.5">
          <Badge variant="light" color="purple">
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
        </div>
      </div>

      <MediaPreviewScope side="right" sideOffset={12}>
        <div className="mb-4 flex flex-col gap-[6px]">
          {cluster.members.map((m) => {
            const key = memberKey(m);
            return (
              <div
                key={key}
                className="flex flex-nowrap items-start justify-start gap-2.5"
              >
                <Checkbox
                  checked={checked.has(key)}
                  onChange={() => toggle(key)}
                  className="mt-0.5"
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex flex-nowrap items-center justify-start gap-[6px]">
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
                  </div>
                  <MediaPreviewTarget
                    mediaId={m.uploadId}
                    startSeconds={m.startSeconds}
                    title={m.uploadTitle}
                    className="block text-inherit no-underline"
                  >
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {m.sampleText}
                    </Text>
                  </MediaPreviewTarget>
                </div>
              </div>
            );
          })}
        </div>
      </MediaPreviewScope>

      {onAssignExisting ? (
        selected.length === 0 ? (
          <Text size="sm" c="dimmed">
            Select at least one segment above to label it.
          </Text>
        ) : (
          <div className="flex flex-col gap-[6px]">
            <Text size="xs" c="dimmed">
              Assigning {selected.length} segment
              {selected.length === 1 ? '' : 's'} — name a new speaker or pick an
              existing one.
            </Text>
            <SpeakerPicker
              channelId={cluster.channelId}
              busy={busy}
              placeholder="Name a new speaker or search existing…"
              onCreate={(speakerName) =>
                onCreate(cluster.channelId, speakerName, selectedMembers)
              }
              onPickExisting={(sp) =>
                onAssignExisting(sp.speakerId, selectedMembers)
              }
            />
          </div>
        )
      ) : (
        <div className="flex flex-nowrap items-end justify-start gap-2.5">
          <TextInput
            label="Name this speaker"
            placeholder="e.g. Guest reader"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) create();
            }}
            wrapperClassName="flex-1 max-w-[320px]"
          />
          <Button onClick={create} disabled={!canCreate} loading={isWorking}>
            Create & assign {selected.length}
          </Button>
        </div>
      )}
    </div>
  );
}

// Unknown speakers: UNLABELED voices that don't match any existing speaker.
// Recurring voices are grouped (name once, mass-attribute); a one-off voice is
// its own 1-member card. Either way, name it and attribute the selected members.
export function SpeakerClusters({
  clusters,
  onCreate,
  onAssignExisting,
  isWorking,
  isAssigning = false,
  showChannel = false,
}: {
  clusters: ClusterRow[];
  onCreate: (
    channelId: string,
    name: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  onAssignExisting?: (
    speakerId: string,
    members: ClusterCreate[],
  ) => Promise<void> | void;
  isWorking: boolean;
  isAssigning?: boolean;
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
    <MediaPreviewGroup>
      <div className="flex flex-col gap-5">
        {paged.slice.map((c) => (
          <ClusterCard
            key={`${c.channelId}:${c.members[0]?.uploadId}:${c.members[0]?.speakerLabel}`}
            cluster={c}
            onCreate={onCreate}
            onAssignExisting={onAssignExisting}
            isWorking={isWorking}
            isAssigning={isAssigning}
            showChannel={showChannel}
          />
        ))}
        {paged.pageCount > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Text size="xs" c="dimmed">
              {clusters.length} groups
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
