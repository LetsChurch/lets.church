import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';

import { signInUrl } from '@/lib/config';
import { send } from '@/lib/messages';
import { getStudioVideos } from '@/lib/studio-api';
import type {
  DuplicateMatch,
  LcContext,
  LcVisibility,
  StudioVideo,
} from '@/lib/types';

import {
  Button,
  Checkbox,
  formatDuration,
  Modal,
  SelectField,
  TextField,
} from './ui';

type VisibilityChoice = 'default' | LcVisibility;

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: VisibilityChoice;
  label: string;
}> = [
  { value: 'default', label: 'Channel default' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'UNLISTED', label: 'Unlisted' },
  { value: 'PRIVATE', label: 'Private' },
];

const channelPrefKey = (youtubeChannelId: string) =>
  `pref:channel:${youtubeChannelId}`;

// Dates are shown and edited in the viewer's local calendar, matching how
// Studio displays them (a Sunday-evening video is "Sunday", not Monday UTC).
function toDateInput(ms: number) {
  const date = new Date(ms);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Keep the original time of day when the user edits only the date. */
function fromDateInput(value: string, previousMs: number) {
  const prev = new Date(previousMs);
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) {
    return previousMs;
  }
  return new Date(
    y,
    m - 1,
    d,
    prev.getHours(),
    prev.getMinutes(),
    prev.getSeconds(),
  ).getTime();
}

function DuplicateBadge({ match }: { match: DuplicateMatch | undefined }) {
  if (!match) {
    return null;
  }
  return (
    <span
      className={
        match.confidence === 'exact'
          ? 'bg-success-soft text-success rounded-full px-2 py-0.5 text-xs font-medium'
          : 'bg-warning-soft text-warning rounded-full px-2 py-0.5 text-xs font-medium'
      }
      title={match.title ? `Matches “${match.title}”` : undefined}
    >
      {match.confidence === 'exact' ? 'Already mirrored' : 'Possible duplicate'}
    </span>
  );
}

export function MirrorDialog({
  videoIds,
  open,
  onOpenChange,
}: {
  videoIds: ReadonlyArray<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const single = videoIds.length === 1;
  const [context, setContext] = useState<LcContext | null | undefined>();
  // As loaded from Studio (what duplicate checks compare against), and the
  // copy the user may edit before mirroring.
  const [loadedVideos, setLoadedVideos] = useState<Array<StudioVideo> | null>(
    null,
  );
  const [videos, setVideos] = useState<Array<StudioVideo> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string>('');
  const [visibility, setVisibility] = useState<VisibilityChoice>('default');
  const [duplicates, setDuplicates] = useState<Record<string, DuplicateMatch>>(
    {},
  );
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const youtubeChannelId = videos?.[0]?.youtubeChannelId ?? null;

  // Load the Let's Church session and the Studio metadata when opened.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setContext(undefined);
    setLoadedVideos(null);
    setVideos(null);
    setDuplicates({});
    setLoadError(null);
    setResult(null);
    Promise.all([send({ type: 'lc:getContext' }), getStudioVideos(videoIds)])
      .then(async ([ctx, vids]) => {
        if (cancelled) {
          return;
        }
        setContext(ctx);
        setLoadedVideos(vids);
        setVideos(vids);
        setIncluded(new Set(vids.map((v) => v.videoId)));
        const ytId = vids[0]?.youtubeChannelId;
        const remembered = ytId
          ? ((await browser.storage.local.get(channelPrefKey(ytId)))[
              channelPrefKey(ytId)
            ] as string | undefined)
          : undefined;
        const channels = ctx?.channels ?? [];
        setChannelId(
          channels.find((c) => c.id === remembered)?.id ??
            channels[0]?.id ??
            '',
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, videoIds]);

  // Check for duplicates when the target channel changes, against the videos
  // as Studio reported them (not on every edit to the title/description).
  useEffect(() => {
    if (!channelId || !loadedVideos || loadedVideos.length === 0) {
      return;
    }
    let cancelled = false;
    setCheckingDuplicates(true);
    send({ type: 'lc:findDuplicates', channelId, videos: loadedVideos })
      .then((matches) => {
        if (cancelled) {
          return;
        }
        setDuplicates(matches);
        // In bulk, skip certain duplicates by default (possible ones stay
        // selected). A single video stays selectable; its badge warns.
        if (loadedVideos.length > 1) {
          setIncluded(
            new Set(
              loadedVideos
                .filter((v) => matches[v.videoId]?.confidence !== 'exact')
                .map((v) => v.videoId),
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDuplicates({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingDuplicates(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, loadedVideos]);

  const channelOptions = useMemo(
    () =>
      (context?.channels ?? []).map((c) => ({ value: c.id, label: c.name })),
    [context],
  );

  const selectedVideos = (videos ?? []).filter((v) => included.has(v.videoId));
  const missingDownloads = selectedVideos.filter((v) => !v.downloadUrl);

  function updateVideo(videoId: string, patch: Partial<StudioVideo>) {
    setVideos((prev) =>
      prev
        ? prev.map((v) => (v.videoId === videoId ? { ...v, ...patch } : v))
        : prev,
    );
  }

  async function submit() {
    const channel = context?.channels.find((c) => c.id === channelId);
    if (!channel || selectedVideos.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      if (youtubeChannelId) {
        // Remembering the channel is a convenience; never block mirroring on it.
        await browser.storage.local
          .set({ [channelPrefKey(youtubeChannelId)]: channel.id })
          .catch(() => undefined);
      }
      const { added, skipped } = await send({
        type: 'queue:enqueue',
        videos: selectedVideos.filter((v) => v.downloadUrl),
        channelId: channel.id,
        channelName: channel.name,
        visibility: visibility === 'default' ? null : visibility,
      });
      setResult(
        `Added ${added} ${added === 1 ? 'video' : 'videos'} to the mirror queue` +
          (skipped > 0 ? ` (${skipped} already queued).` : '.') +
          ' Keep the queue tab open until uploads finish.',
      );
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const loading = !loadError && (context === undefined || videos === null);
  let body: React.ReactNode;
  if (loadError) {
    body = <p className="text-danger text-sm">{loadError}</p>;
  } else if (loading) {
    body = <p className="text-muted text-sm">Loading video details…</p>;
  } else if (context === null) {
    body = (
      <p className="text-sm">
        Sign in to Let&apos;s Church to mirror videos.{' '}
        <a
          href={signInUrl()}
          target="_blank"
          rel="noreferrer"
          className="text-link font-medium underline"
        >
          Sign in
        </a>
        , then try again.
      </p>
    );
  } else if (context && context.channels.length === 0) {
    body = (
      <p className="text-sm">
        Your Let&apos;s Church account can&apos;t upload to any channel yet. Ask
        a channel admin to give you upload access.
      </p>
    );
  } else if (result) {
    body = <p className="text-sm">{result}</p>;
  } else if (videos) {
    const first = videos[0];
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <SelectField
            label="Let's Church channel"
            value={channelId}
            onChange={setChannelId}
            options={channelOptions}
          />
          <SelectField
            label="Visibility"
            value={visibility}
            onChange={setVisibility}
            options={VISIBILITY_OPTIONS}
          />
        </div>

        {single && first ? (
          <div className="flex flex-col gap-3">
            {first.thumbnailUrl ? (
              <img
                src={first.thumbnailUrl}
                alt=""
                className="aspect-video w-48 rounded-lg object-cover"
              />
            ) : null}
            <DuplicateBadge match={duplicates[first.videoId]} />
            <TextField
              label="Title"
              value={first.title}
              onChange={(title) => updateVideo(first.videoId, { title })}
            />
            <TextField
              label="Description"
              multiline
              value={first.description}
              onChange={(description) =>
                updateVideo(first.videoId, { description })
              }
            />
            <TextField
              label="Date"
              type="date"
              value={toDateInput(first.publishedAt)}
              onChange={(value) =>
                updateVideo(first.videoId, {
                  publishedAt: fromDateInput(value, first.publishedAt),
                })
              }
            />
            <p className="text-muted text-xs">
              Length {formatDuration(first.lengthSeconds)} · YouTube{' '}
              {first.privacy}
              {first.originalFileName ? ` · ${first.originalFileName}` : ''}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted text-xs">
              <tr>
                <th className="w-8 py-2 font-medium">
                  <Checkbox
                    label="Select all"
                    checked={included.size === videos.length}
                    onChange={(checked) =>
                      setIncluded(
                        new Set(checked ? videos.map((v) => v.videoId) : []),
                      )
                    }
                  />
                </th>
                <th className="py-2 font-medium">Video</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Length</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.videoId} className="border-rule border-t">
                  <td className="py-2">
                    <Checkbox
                      label={`Mirror ${v.title}`}
                      checked={included.has(v.videoId)}
                      disabled={!v.downloadUrl}
                      onChange={(checked) =>
                        setIncluded((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(v.videoId);
                          } else {
                            next.delete(v.videoId);
                          }
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="max-w-72 py-2 pr-2" title={v.title}>
                    <div className="flex items-center gap-3">
                      {v.thumbnailUrl ? (
                        <img
                          src={v.thumbnailUrl}
                          alt=""
                          className="aspect-video w-16 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <span className="truncate">{v.title || v.videoId}</span>
                    </div>
                  </td>
                  <td className="text-muted py-2 pr-2 whitespace-nowrap">
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="text-muted py-2 pr-2">
                    {formatDuration(v.lengthSeconds)}
                  </td>
                  <td className="py-2">
                    {v.downloadUrl ? (
                      <DuplicateBadge match={duplicates[v.videoId]} />
                    ) : (
                      <span className="text-muted text-xs">
                        No download available
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {checkingDuplicates ? (
          <p className="text-muted text-xs">Checking for duplicates…</p>
        ) : null}
        {missingDownloads.length > 0 ? (
          <p className="text-warning text-xs">
            YouTube doesn&apos;t offer a download for{' '}
            {missingDownloads.length === 1
              ? 'this video'
              : `${missingDownloads.length} of these videos`}{' '}
            (for example, it is still processing); it will be skipped.
          </p>
        ) : null}
      </div>
    );
  }

  const canSubmit =
    !!context &&
    !!channelId &&
    !result &&
    !submitting &&
    selectedVideos.some((v) => v.downloadUrl);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide={!single}
      title={
        single
          ? "Mirror to Let's Church"
          : `Mirror ${videoIds.length} videos to Let's Church`
      }
      description={
        context?.username ? `Signed in as ${context.username}` : undefined
      }
      footer={
        result ? (
          <>
            <Button onClick={() => void send({ type: 'queue:open' })}>
              Open queue
            </Button>
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {submitting
                ? 'Adding…'
                : single
                  ? 'Mirror video'
                  : `Mirror ${selectedVideos.length} ${selectedVideos.length === 1 ? 'video' : 'videos'}`}
            </Button>
          </>
        )
      }
    >
      {body}
    </Modal>
  );
}
