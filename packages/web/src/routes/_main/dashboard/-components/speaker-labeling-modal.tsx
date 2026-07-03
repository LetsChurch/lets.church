import { Popover } from '@base-ui/react/popover';
import {
  IconArrowBackUp,
  IconDotsVertical,
  IconLink,
  IconPlus,
  IconScissors,
  IconSparkles,
  IconUserOff,
} from '@tabler/icons-react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { LcMenu, MenuItemButton } from '@/components/lc-menu';
import { LcModal } from '@/components/lc-modal';
import {
  ActionIcon,
  Button,
  Loader,
  Text,
  TextInput,
  Tooltip,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import styles from './speaker-labeling-modal.module.css';
import { PickerRow } from './speaker-picker';

type SpeakerLabelingModalProps = {
  opened: boolean;
  onClose: () => void;
  channelId: string;
  uploadId: string;
};

type Paragraph = {
  id: string;
  order: number;
  start: number;
  end: number;
  speaker: string | null;
  effectiveLabel: string | null;
  text: string;
};

type StagedSpeaker = { id: string; name: string };
type Attribution = { speakerId: string; speakerName: string };

type ChannelSpeaker = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
};

// One run of consecutive paragraphs sharing an effective label — the visual
// "turn" in the transcript, the unit the inline menu reassigns.
type Turn = {
  key: string;
  label: string;
  start: number;
  paragraphIds: string[];
  // The turn's constituent paragraphs, so a single one can be split out of the
  // turn's label without affecting its neighbors.
  paragraphs: { id: string; text: string }[];
  // True when any paragraph in the turn has been moved off its diarization
  // label (a committed or staged override) — enables "Reset to detected".
  hasOverride: boolean;
};

// Stable per-label color palette (color-family keys), assigned by first
// appearance so the sidebar and transcript agree.
const LABEL_COLORS = [
  'red',
  'blue',
  'teal',
  'grape',
  'orange',
  'pink',
  'lime',
  'cyan',
  'indigo',
  'yellow',
  'green',
  'violet',
] as const;

// Concrete Tailwind classes for each palette color, replacing Mantine's
// palette-driven `Avatar color` / `c={`${color}.5`}` coloring. `text` is used
// for the colored speaker name; `avatar` for the letter-avatar chip.
const SPEAKER_COLORS: Record<string, { text: string; avatar: string }> = {
  red: {
    text: 'text-red-600 dark:text-red-400',
    avatar: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    avatar: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  teal: {
    text: 'text-teal-600 dark:text-teal-400',
    avatar: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  },
  grape: {
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    avatar:
      'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  },
  orange: {
    text: 'text-orange-600 dark:text-orange-400',
    avatar:
      'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  },
  pink: {
    text: 'text-pink-600 dark:text-pink-400',
    avatar: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  },
  lime: {
    text: 'text-lime-600 dark:text-lime-400',
    avatar: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
  },
  cyan: {
    text: 'text-cyan-600 dark:text-cyan-400',
    avatar: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
  indigo: {
    text: 'text-indigo-600 dark:text-indigo-400',
    avatar:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  yellow: {
    text: 'text-yellow-600 dark:text-yellow-400',
    avatar:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
  },
  green: {
    text: 'text-green-600 dark:text-green-400',
    avatar:
      'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  violet: {
    text: 'text-violet-600 dark:text-violet-400',
    avatar:
      'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  gray: {
    text: 'text-gray-600 dark:text-gray-400',
    avatar: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  },
};

const speakerColorClasses = (color: string) =>
  SPEAKER_COLORS[color] ?? SPEAKER_COLORS.gray;

// Voice-match confidence at/above which an unassigned label surfaces a
// one-click "assign this person" action in the sidebar. Tunable.
const STRONG_MATCH_PERCENT = 80;

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

export function SpeakerLabelingModal({
  opened,
  onClose,
  channelId,
  uploadId,
}: SpeakerLabelingModalProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const transcriptQuery = useQuery({
    ...trpc.dashboard.channels.getUploadTranscriptForLabeling.queryOptions({
      channelId,
      uploadId,
    }),
    enabled: opened,
  });
  const speakersQuery = useQuery({
    ...trpc.dashboard.channels.getChannelSpeakers.queryOptions({ channelId }),
    enabled: opened,
  });

  // Staged, uncommitted edits — nothing hits the DB (or reindexes) until Save.
  // paraLabelDraft: paragraphId → new effective label.
  // attrDraft: effective label → speakerId (or null to unassign).
  // stagedNames: speakerId → name, so a staged attribution can render its name.
  const [paraLabelDraft, setParaLabelDraft] = useState<Record<string, string>>(
    {},
  );
  const [attrDraft, setAttrDraft] = useState<Record<string, string | null>>({});
  const [stagedNames, setStagedNames] = useState<Record<string, string>>({});

  const resetDrafts = () => {
    setParaLabelDraft({});
    setAttrDraft({});
    setStagedNames({});
  };

  const handleClose = () => {
    resetDrafts();
    onClose();
  };

  const invalidateChannelSpeakers = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.channels.getChannelSpeakers.queryKey({
        channelId,
      }),
    });

  const stageAttribution = (label: string, speaker: StagedSpeaker | null) => {
    setAttrDraft((d) => ({ ...d, [label]: speaker?.id ?? null }));
    if (speaker) {
      setStagedNames((n) => ({ ...n, [speaker.id]: speaker.name }));
    }
  };

  const stageParagraphLabel = (paragraphIds: string[], label: string) => {
    setParaLabelDraft((d) => {
      const next = { ...d };
      for (const id of paragraphIds) next[id] = label;
      return next;
    });
  };

  // paragraphId → original diarization label, for undoing overrides.
  const diarizationById = useMemo(
    () =>
      new Map(
        (transcriptQuery.data?.paragraphs ?? []).map((p) => [
          p.id,
          p.speaker ?? 'Unknown speaker',
        ]),
      ),
    [transcriptQuery.data?.paragraphs],
  );

  // Undo overrides: stage each paragraph back to its diarization label (Save
  // then deletes the override rows).
  const resetParagraphLabels = (paragraphIds: string[]) => {
    setParaLabelDraft((d) => {
      const next = { ...d };
      for (const id of paragraphIds) {
        next[id] = diarizationById.get(id) ?? 'Unknown speaker';
      }
      return next;
    });
  };

  const ownSpeakers = speakersQuery.data?.speakers ?? [];

  // id → display name, from the channel library, the committed attributions, and
  // anything staged this session.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of ownSpeakers) m.set(s.id, s.name);
    for (const a of transcriptQuery.data?.attributions ?? [])
      m.set(a.speakerId, a.speakerName);
    for (const [id, name] of Object.entries(stagedNames)) m.set(id, name);
    return m;
  }, [ownSpeakers, transcriptQuery.data?.attributions, stagedNames]);

  // Effective-label order, color, turns, and all paragraph ids per label —
  // computed from the transcript with the staged paragraph overrides applied.
  const { labelOrder, colorOf, turns, paragraphIdsByLabel } = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    const builtTurns: Turn[] = [];
    const idsByLabel = new Map<string, string[]>();

    let current: Turn | null = null;
    for (const p of (transcriptQuery.data?.paragraphs ?? []) as Paragraph[]) {
      const label =
        paraLabelDraft[p.id] ?? p.effectiveLabel ?? 'Unknown speaker';
      const overridden = label !== (p.speaker ?? 'Unknown speaker');
      if (!seen.has(label)) {
        seen.add(label);
        order.push(label);
      }
      const ids = idsByLabel.get(label);
      if (ids) ids.push(p.id);
      else idsByLabel.set(label, [p.id]);
      if (!current || current.label !== label) {
        current = {
          key: `${label}-${p.id}`,
          label,
          start: p.start,
          paragraphIds: [p.id],
          paragraphs: [{ id: p.id, text: p.text }],
          hasOverride: overridden,
        };
        builtTurns.push(current);
      } else {
        current.paragraphIds.push(p.id);
        current.paragraphs.push({ id: p.id, text: p.text });
        current.hasOverride = current.hasOverride || overridden;
      }
    }

    const colorMap = new Map(
      order.map((label, i) => [label, LABEL_COLORS[i % LABEL_COLORS.length]]),
    );
    return {
      labelOrder: order,
      colorOf: (label: string): string => colorMap.get(label) ?? 'gray',
      turns: builtTurns,
      paragraphIdsByLabel: idsByLabel,
    };
  }, [transcriptQuery.data?.paragraphs, paraLabelDraft]);

  const originalAttrByLabel = useMemo(
    () =>
      new Map(
        (transcriptQuery.data?.attributions ?? []).map((a) => [
          a.label,
          { speakerId: a.speakerId, speakerName: a.speakerName },
        ]),
      ),
    [transcriptQuery.data?.attributions],
  );

  // The attribution shown for a label, with staged edits overriding committed.
  const attributionOf = (label: string): Attribution | null => {
    if (label in attrDraft) {
      const id = attrDraft[label];
      if (!id) return null;
      return { speakerId: id, speakerName: nameById.get(id) ?? '…' };
    }
    return originalAttrByLabel.get(label) ?? null;
  };

  // The (first) local label already assigned to a speaker — so assigning that
  // same speaker elsewhere can merge into this label instead of duplicating it.
  const labelBySpeakerId = new Map<string, string>();
  for (const l of labelOrder) {
    const attr = attributionOf(l);
    if (attr && !labelBySpeakerId.has(attr.speakerId)) {
      labelBySpeakerId.set(attr.speakerId, l);
    }
  }
  const labelForSpeakerId = (speakerId: string) =>
    labelBySpeakerId.get(speakerId) ?? null;

  // Display name for a label: diarization labels (SPEAKER_NN) are numbered by
  // order of appearance ("Speaker 1", "Speaker 2", …) so gaps from merged-away
  // labels (or live edits) never surface as "Speaker 1, Speaker 3". Custom
  // user-created labels are shown verbatim.
  const displayLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    let n = 0;
    for (const label of labelOrder) {
      if (/^SPEAKER_\d+$/i.test(label)) {
        n += 1;
        m.set(label, `Speaker ${n}`);
      } else {
        m.set(label, label);
      }
    }
    return m;
  }, [labelOrder]);
  const displayLabel = (label: string) =>
    displayLabelMap.get(label) ?? prettyLabel(label);

  // A brand-new diarization label for splitting a paragraph out on its own:
  // SPEAKER_NN one past the highest number seen across detected labels, current
  // effective labels, and staged overrides — so it's unique and renders as the
  // next "Speaker N". Sequential splits get distinct labels (the prior split is
  // already in paraLabelDraft, raising the max).
  const makeFreshLabel = () => {
    let max = -1;
    const consider = (l: string | null | undefined) => {
      const m = l ? /^SPEAKER_?0*(\d+)$/i.exec(l) : null;
      if (m) max = Math.max(max, Number(m[1]));
    };
    for (const p of transcriptQuery.data?.paragraphs ?? []) consider(p.speaker);
    for (const l of labelOrder) consider(l);
    for (const l of Object.values(paraLabelDraft)) consider(l);
    return `SPEAKER_${String(max + 1).padStart(2, '0')}`;
  };

  const hasChanges =
    Object.keys(paraLabelDraft).length > 0 || Object.keys(attrDraft).length > 0;

  const saveMutation = useMutation(
    trpc.dashboard.channels.saveSpeakerLabeling.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Speaker labels saved' });
        // Drop the cached transcript so a reopen reflects the committed state.
        await queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.channels.getUploadTranscriptForLabeling.queryKey({
              channelId,
              uploadId,
            }),
        });
        handleClose();
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to save' }),
    }),
  );

  const save = () =>
    saveMutation.mutate({
      channelId,
      uploadId,
      paragraphLabels: Object.entries(paraLabelDraft).map(
        ([paragraphId, label]) => ({ paragraphId, label }),
      ),
      attributions: Object.entries(attrDraft).map(
        ([speakerLabel, speakerId]) => ({ speakerLabel, speakerId }),
      ),
    });

  const isLoading = transcriptQuery.isLoading || speakersQuery.isLoading;
  const noTranscript =
    !isLoading && (transcriptQuery.data?.paragraphs.length ?? 0) === 0;

  return (
    <LcModal.Root
      open={opened}
      // Keep the modal open on outside-press while there are unsaved changes
      // (mirrors Mantine `closeOnClickOutside={!hasChanges}`); escape still
      // closes, matching the old default `closeOnEscape`.
      onOpenChange={(open, details) => {
        if (open) return;
        if (hasChanges && details.reason === 'outside-press') return;
        handleClose();
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="full" className="flex h-dvh flex-col">
          <div className="flex items-center justify-between border-gray-200 border-b px-4 py-3 dark:border-zinc-800">
            <LcModal.Title>Label speakers</LcModal.Title>
            <LcModal.Close />
          </div>

          {isLoading ? (
            <div className="flex flex-wrap items-center justify-center gap-4 py-8">
              <Loader />
            </div>
          ) : noTranscript ? (
            <Text c="dimmed" className="p-5">
              This upload has no transcript paragraphs yet. Speaker labeling
              becomes available once transcription finishes.
            </Text>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1">
                {/* Transcript */}
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="flex max-w-[760px] flex-col gap-5">
                    {turns.map((turn) => {
                      const attribution = attributionOf(turn.label);
                      const color = colorOf(turn.label);
                      return (
                        <div key={turn.key}>
                          <div className="mb-[4px] flex flex-wrap items-center justify-start gap-2.5">
                            <SpeakerAssignPopover
                              channelId={channelId}
                              uploadId={uploadId}
                              label={turn.label}
                              attribution={attribution}
                              ownSpeakers={ownSpeakers}
                              onStage={stageAttribution}
                              onChannelSpeakersChanged={
                                invalidateChannelSpeakers
                              }
                              position="bottom-start"
                              paragraphIds={turn.paragraphIds}
                              onReassign={stageParagraphLabel}
                              labelForSpeakerId={labelForSpeakerId}
                              displayLabel={displayLabel}
                              turnMenu={{
                                otherLabels: labelOrder.filter(
                                  (l) => l !== turn.label,
                                ),
                                hasOverride: turn.hasOverride,
                                onReset: resetParagraphLabels,
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-start gap-[6px]">
                                <Text
                                  fw={700}
                                  size="sm"
                                  className={speakerColorClasses(color).text}
                                >
                                  {attribution
                                    ? attribution.speakerName
                                    : displayLabel(turn.label)}
                                </Text>
                                <IconDotsVertical
                                  size={13}
                                  style={{ opacity: 0.5 }}
                                />
                              </div>
                            </SpeakerAssignPopover>
                            <Text size="xs" c="dimmed">
                              {formatTimestamp(turn.start)}
                            </Text>
                          </div>
                          <div className="flex flex-col gap-[6px]">
                            {turn.paragraphs.map((para) => (
                              <div
                                key={para.id}
                                className={cn(
                                  styles.paragraph,
                                  'flex flex-nowrap items-start justify-start gap-2.5',
                                )}
                              >
                                <Text
                                  size="sm"
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.6,
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  {para.text}
                                </Text>
                                {/* Only multi-paragraph turns can be split; a
                                    lone paragraph is already its own turn (use
                                    the header menu to move it). */}
                                {turn.paragraphs.length > 1 ? (
                                  <ParagraphSplitControl
                                    otherLabels={labelOrder.filter(
                                      (l) => l !== turn.label,
                                    )}
                                    displayLabel={displayLabel}
                                    onMove={(toLabel) =>
                                      stageParagraphLabel([para.id], toLabel)
                                    }
                                    onSplitNew={() =>
                                      stageParagraphLabel(
                                        [para.id],
                                        makeFreshLabel(),
                                      )
                                    }
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* People */}
                <div className="flex min-h-0 w-80 flex-col border-gray-200 border-l dark:border-zinc-800">
                  <Text fw={600} size="sm" className="px-4 pt-4 pb-2.5">
                    People
                  </Text>
                  <div className="flex-1 overflow-y-auto px-2.5">
                    <div className="flex flex-col gap-[2px] pb-3">
                      {labelOrder.map((label) => (
                        <PersonRow
                          key={label}
                          channelId={channelId}
                          uploadId={uploadId}
                          label={label}
                          color={colorOf(label)}
                          attribution={attributionOf(label)}
                          ownSpeakers={ownSpeakers}
                          paragraphIds={paragraphIdsByLabel.get(label) ?? []}
                          onStage={stageAttribution}
                          onReassign={stageParagraphLabel}
                          labelForSpeakerId={labelForSpeakerId}
                          displayLabel={displayLabel}
                          onChannelSpeakersChanged={invalidateChannelSpeakers}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer — nothing is written until Save. */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-gray-200 border-t px-5 py-3 dark:border-zinc-800">
                <Text size="xs" c="dimmed">
                  {hasChanges
                    ? 'Unsaved changes — saving re-indexes this upload once.'
                    : 'No unsaved changes.'}
                </Text>
                <div className="flex flex-wrap items-center justify-start gap-3">
                  <Button variant="default" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={save}
                    loading={saveMutation.isPending}
                    disabled={!hasChanges}
                  >
                    Save changes
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

// Sidebar row for one local label: shows its color + assigned identity (or the
// local label), opening the integrated speaker picker on click. When the label
// is unassigned but a stored voice is a strong match, a one-click assign action
// is surfaced inline.
function PersonRow({
  channelId,
  uploadId,
  label,
  color,
  attribution,
  ownSpeakers,
  paragraphIds,
  onStage,
  onReassign,
  labelForSpeakerId,
  displayLabel,
  onChannelSpeakersChanged,
}: {
  channelId: string;
  uploadId: string;
  label: string;
  color: string;
  attribution: Attribution | null;
  ownSpeakers: ChannelSpeaker[];
  paragraphIds: string[];
  onStage: (label: string, speaker: StagedSpeaker | null) => void;
  onReassign: (paragraphIds: string[], label: string) => void;
  labelForSpeakerId: (speakerId: string) => string | null;
  displayLabel: (label: string) => string;
  onChannelSpeakersChanged: () => void;
}) {
  const trpc = useTRPC();
  const suggestionsQuery = useQuery({
    ...trpc.dashboard.channels.suggestSpeakerCandidates.queryOptions({
      channelId,
      uploadId,
      speakerLabel: label,
    }),
    // Only need a suggestion for labels that aren't assigned yet.
    enabled: attribution == null,
  });
  const top = suggestionsQuery.data?.candidates?.[0];
  const strongMatch =
    attribution == null &&
    top &&
    typeof top.matchPercent === 'number' &&
    top.matchPercent >= STRONG_MATCH_PERCENT
      ? top
      : null;

  return (
    <div className="flex flex-nowrap items-center justify-start gap-[4px]">
      <SpeakerAssignPopover
        channelId={channelId}
        uploadId={uploadId}
        label={label}
        attribution={attribution}
        ownSpeakers={ownSpeakers}
        paragraphIds={paragraphIds}
        onStage={onStage}
        onReassign={onReassign}
        labelForSpeakerId={labelForSpeakerId}
        displayLabel={displayLabel}
        onChannelSpeakersChanged={onChannelSpeakersChanged}
        triggerClassName={styles.row}
        triggerStyle={{ padding: '6px 8px', flex: 1, minWidth: 0 }}
      >
        <div className="flex flex-nowrap items-center justify-start gap-3">
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full font-bold text-sm',
              speakerColorClasses(color).avatar,
            )}
          >
            {(attribution?.speakerName ?? displayLabel(label))
              .charAt(0)
              .toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>
              {attribution ? attribution.speakerName : displayLabel(label)}
            </Text>
            {attribution ? null : strongMatch ? (
              <Text size="xs" c="dimmed" truncate>
                Looks like {strongMatch.name}
              </Text>
            ) : (
              <Text size="xs" c="dimmed">
                Unassigned
              </Text>
            )}
          </div>
        </div>
      </SpeakerAssignPopover>
      {strongMatch ? (
        <Tooltip
          label={`Assign ${strongMatch.name} · ${strongMatch.matchPercent}% voice match`}
        >
          <Button
            size="xs"
            variant="light"
            leftSection={<IconSparkles size={12} />}
            onClick={() => {
              // Mirror the picker's merge behavior: if the matched speaker is
              // already on another local label, merge into it.
              const existing = labelForSpeakerId(strongMatch.speakerId);
              if (existing && existing !== label) {
                onReassign(paragraphIds, existing);
              } else {
                onStage(label, {
                  id: strongMatch.speakerId,
                  name: strongMatch.name,
                });
              }
            }}
          >
            {strongMatch.matchPercent}%
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
}

// The transcript turn menu's extra "move to another local label / reset"
// section (sidebar rows omit it).
type TurnMenuConfig = {
  otherLabels: string[];
  hasOverride: boolean;
  onReset: (paragraphIds: string[]) => void;
};

// Integrated speaker picker: suggestions (voice match w/ %), this channel's
// speakers, speakers from OTHER channels (picking one sends a link request),
// and create-new — plus, in the transcript turn menu, moving the turn to a
// different local label. Assignments are staged. Assigning a speaker who is
// already on another local label here MERGES this turn/label into that label
// (a paragraph override, undoable) rather than duplicating the person; creating
// a speaker and sending a link request happen immediately (no reindex).
function SpeakerAssignPopover({
  channelId,
  uploadId,
  label,
  attribution,
  ownSpeakers,
  paragraphIds,
  onStage,
  onReassign,
  labelForSpeakerId,
  displayLabel,
  onChannelSpeakersChanged,
  position = 'left-start',
  triggerClassName,
  triggerStyle,
  turnMenu,
  children,
}: {
  channelId: string;
  uploadId: string;
  label: string;
  attribution: Attribution | null;
  ownSpeakers: ChannelSpeaker[];
  paragraphIds: string[];
  onStage: (label: string, speaker: StagedSpeaker | null) => void;
  onReassign: (paragraphIds: string[], label: string) => void;
  labelForSpeakerId: (speakerId: string) => string | null;
  displayLabel: (label: string) => string;
  onChannelSpeakersChanged: () => void;
  position?: 'left-start' | 'bottom-start';
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  turnMenu?: TurnMenuConfig;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const trimmed = query.trim();
  // Debounced so the cross-channel search doesn't refetch on every keystroke;
  // immediate UI (Create button, own-speaker filter) still uses `trimmed`.
  const [debouncedQuery] = useDebouncedValue(trimmed, 200);

  const suggestionsQuery = useQuery({
    ...trpc.dashboard.channels.suggestSpeakerCandidates.queryOptions({
      channelId,
      uploadId,
      speakerLabel: label,
    }),
    enabled: opened,
  });

  const othersQuery = useQuery({
    ...trpc.dashboard.channels.searchSpeakers.queryOptions({
      channelId,
      query: debouncedQuery,
    }),
    enabled: opened && debouncedQuery.length >= 2,
    // Keep the prior results on screen while the next search loads so the
    // dropdown doesn't collapse and re-expand (which shifts the Create button
    // and reflows the whole popover) on each keystroke.
    placeholderData: keepPreviousData,
  });

  const onError = (error: { message?: string }) =>
    showFailure({ message: error.message || 'Something went wrong' });

  const createMutation = useMutation(
    trpc.dashboard.channels.createSpeaker.mutationOptions({ onError }),
  );
  const requestMutation = useMutation(
    trpc.dashboard.channels.requestSpeakerLink.mutationOptions({
      onSuccess: () => {
        showSuccess({
          message: 'Link request sent. The owning channel must approve it.',
        });
        close();
      },
      onError,
    }),
  );

  function close() {
    setOpened(false);
    setQuery('');
    setNewLabel('');
  }

  const stage = (speaker: StagedSpeaker | null) => {
    // Assigning a speaker who already owns another local label here merges this
    // turn/label into that label (an undoable override) instead of leaving two
    // labels for one person.
    if (speaker) {
      const existing = labelForSpeakerId(speaker.id);
      if (existing && existing !== label) {
        onReassign(paragraphIds, existing);
        close();
        return;
      }
    }
    onStage(label, speaker);
    close();
  };

  const doReassign = (toLabel: string) => {
    if (!toLabel.trim()) return;
    onReassign(paragraphIds, toLabel.trim());
    close();
  };

  const doReset = () => {
    if (!turnMenu) return;
    turnMenu.onReset(paragraphIds);
    close();
  };

  const createAndAssign = async () => {
    try {
      const { speaker } = await createMutation.mutateAsync({
        channelId,
        name: trimmed,
      });
      onChannelSpeakersChanged();
      stage({ id: speaker.id, name: speaker.name });
    } catch {
      // surfaced via onError
    }
  };

  const filteredOwn = ownSpeakers.filter(
    (s) => !trimmed || s.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const suggestions = (suggestionsQuery.data?.candidates ?? []).filter(
    (c) => c.speakerId !== attribution?.speakerId,
  );
  // Gated on the debounced length so kept-previous results don't linger once
  // the field is cleared back below the search threshold.
  const others =
    debouncedQuery.length >= 2 ? (othersQuery.data?.results ?? []) : [];
  const ownNames = new Set(ownSpeakers.map((s) => s.name.toLowerCase()));
  const canCreate = trimmed.length > 0 && !ownNames.has(trimmed.toLowerCase());

  const side = position === 'bottom-start' ? 'bottom' : 'left';

  return (
    <Popover.Root open={opened} onOpenChange={setOpened}>
      <Popover.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            className={cn(
              'cursor-pointer border-0 bg-transparent p-0 text-left',
              triggerClassName,
            )}
            style={triggerStyle}
          >
            {children}
          </button>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner side={side} align="start" sideOffset={4}>
          <Popover.Popup className="w-75 overflow-hidden rounded-lg border-fancy-pants bg-white shadow-xl transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-zinc-900">
            <div className="p-2">
              {/* The detected diarization label is surfaced only here — once
                  assigned, the transcript/sidebar show the person's name. */}
              <Text size="xs" c="dimmed" className="mb-[4px]">
                Detected: {displayLabel(label)}
              </Text>
              <TextInput
                placeholder="Assign to a person…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                autoFocus
                // Loading feedback lives in the input so the dropdown body never
                // changes height while a search is in flight (which would shove
                // the items below — including Create — around and read as
                // flicker).
                rightSection={
                  debouncedQuery.length >= 2 && othersQuery.isFetching ? (
                    <Loader size="xs" />
                  ) : null
                }
              />
              {/* Create is a fixed header action so it's always offered and
                  never moves as search results stream in below. */}
              {canCreate ? (
                <Button
                  variant="light"
                  size="sm"
                  fullWidth
                  className="mt-2 justify-start"
                  leftSection={<IconPlus size={14} />}
                  loading={createMutation.isPending}
                  onClick={createAndAssign}
                >
                  Create “{trimmed}”
                </Button>
              ) : null}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              <div className="flex flex-col gap-[2px] px-2.5 pb-2.5">
                {attribution ? (
                  <>
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      className="justify-start"
                      leftSection={<IconUserOff size={14} />}
                      onClick={() => stage(null)}
                    >
                      Remove {attribution.speakerName}
                    </Button>
                    <hr className="my-[2px]" />
                  </>
                ) : null}

                {!trimmed && suggestions.length > 0 ? (
                  <>
                    <Text size="xs" c="dimmed" className="px-[4px] pt-[2px]">
                      Suggested
                    </Text>
                    {suggestions.slice(0, 5).map((c, i) => (
                      <PickerRow
                        key={c.speakerId}
                        name={c.name}
                        subtitle={c.channelName}
                        sparkle={i === 0}
                        matchPercent={c.matchPercent}
                        onClick={() => stage({ id: c.speakerId, name: c.name })}
                      />
                    ))}
                    <hr className="my-[2px]" />
                  </>
                ) : null}

                {filteredOwn.length > 0 ? (
                  <>
                    <Text size="xs" c="dimmed" className="px-[4px] pt-[2px]">
                      This channel
                    </Text>
                    {filteredOwn.map((s) => (
                      <PickerRow
                        key={s.id}
                        name={s.name}
                        selected={s.id === attribution?.speakerId}
                        onClick={() => stage({ id: s.id, name: s.name })}
                      />
                    ))}
                  </>
                ) : null}

                {others.length > 0 ? (
                  <>
                    <Text size="xs" c="dimmed" className="px-[4px] pt-[6px]">
                      Other channels
                    </Text>
                    {others.map((r) => (
                      <PickerRow
                        key={r.speakerId}
                        name={r.name}
                        subtitle={r.channelName}
                        icon={<IconLink size={14} />}
                        badge={
                          r.linkStatus === 'ACCEPTED'
                            ? { label: 'Linked', color: 'green' }
                            : r.linkStatus === 'PENDING'
                              ? { label: 'Requested', color: 'yellow' }
                              : { label: 'Request', color: 'gray' }
                        }
                        onClick={() => {
                          if (r.linkStatus === 'ACCEPTED')
                            stage({ id: r.speakerId, name: r.name });
                          else
                            requestMutation.mutate({
                              channelId,
                              speakerId: r.speakerId,
                              forUploadId: uploadId,
                            });
                        }}
                      />
                    ))}
                  </>
                ) : null}

                {/* Turn menu only: move this turn's paragraphs to a different
                    local speaker label (a paragraph override), distinct from
                    assigning a person above. */}
                {turnMenu ? (
                  <>
                    <hr className="my-[2px]" />
                    {turnMenu.hasOverride ? (
                      <Button
                        variant="subtle"
                        color="gray"
                        size="sm"
                        className="justify-start"
                        leftSection={<IconArrowBackUp size={14} />}
                        onClick={doReset}
                      >
                        Reset to detected speaker
                      </Button>
                    ) : null}
                    <Text size="xs" c="dimmed" className="px-[4px] pt-[2px]">
                      Move this turn to another speaker
                    </Text>
                    {turnMenu.otherLabels.map((l) => (
                      <Button
                        key={l}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        className="justify-start"
                        onClick={() => doReassign(l)}
                      >
                        {displayLabel(l)}
                      </Button>
                    ))}
                    <div className="flex flex-wrap items-end justify-start gap-2.5 px-[4px] pt-[4px]">
                      <TextInput
                        placeholder="New label"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.currentTarget.value)}
                        wrapperClassName="flex-1"
                      />
                      <ActionIcon
                        variant="light"
                        disabled={newLabel.trim().length === 0}
                        onClick={() => doReassign(newLabel)}
                      >
                        <IconPlus size={16} />
                      </ActionIcon>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Per-paragraph split affordance: pull a single paragraph out of its turn's
// label, either onto a brand-new speaker (the common "diarization merged two
// people" fix) or onto another existing local label. Staging the override
// re-splits the turn on the next render.
function ParagraphSplitControl({
  otherLabels,
  displayLabel,
  onMove,
  onSplitNew,
}: {
  otherLabels: string[];
  displayLabel: (label: string) => string;
  onMove: (toLabel: string) => void;
  onSplitNew: () => void;
}) {
  return (
    <LcMenu.Root>
      <LcMenu.Trigger
        render={(props) => (
          <ActionIcon
            {...props}
            variant="subtle"
            color="gray"
            size="sm"
            className={styles.splitControl}
            aria-label="Split this paragraph out"
          >
            <IconScissors size={15} />
          </ActionIcon>
        )}
      />
      <LcMenu.Portal>
        <LcMenu.Positioner side="bottom" align="end">
          <LcMenu.Popup className="w-[220px]">
            <MenuItemButton icon={<IconPlus size={14} />} onClick={onSplitNew}>
              Split to a new speaker
            </MenuItemButton>
            {otherLabels.length > 0 ? (
              <>
                <LcMenu.Separator />
                <div className="px-3 py-1.5 font-medium text-secondary text-xs">
                  Move to
                </div>
                {otherLabels.map((l) => (
                  <MenuItemButton key={l} onClick={() => onMove(l)}>
                    {displayLabel(l)}
                  </MenuItemButton>
                ))}
              </>
            ) : null}
          </LcMenu.Popup>
        </LcMenu.Positioner>
      </LcMenu.Portal>
    </LcMenu.Root>
  );
}
