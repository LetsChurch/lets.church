import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconCheck,
  IconDotsVertical,
  IconLink,
  IconPlus,
  IconSparkles,
  IconUserOff,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../../-mantine';
import styles from './speaker-labeling-modal.module.css';

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
  text: string;
  // True when any paragraph in the turn has been moved off its diarization
  // label (a committed or staged override) — enables "Reset to detected".
  hasOverride: boolean;
};

// Stable per-label color palette (Mantine color names), assigned by first
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
          text: p.text,
          hasOverride: overridden,
        };
        builtTurns.push(current);
      } else {
        current.paragraphIds.push(p.id);
        current.text += `\n\n${p.text}`;
        current.hasOverride = current.hasOverride || overridden;
      }
    }

    const colorMap = new Map(
      order.map((label, i) => [label, LABEL_COLORS[i % LABEL_COLORS.length]]),
    );
    return {
      labelOrder: order,
      colorOf: (label: string) => colorMap.get(label) ?? 'gray',
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
    <Modal
      opened={opened}
      onClose={handleClose}
      title={<Title order={3}>Label speakers</Title>}
      fullScreen
      closeOnClickOutside={!hasChanges}
      styles={{ body: { height: 'calc(100dvh - 62px)', padding: 0 } }}
    >
      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : noTranscript ? (
        <Text c="dimmed" p="lg">
          This upload has no transcript paragraphs yet. Speaker labeling becomes
          available once transcription finishes.
        </Text>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
          }}
        >
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Transcript */}
            <ScrollArea style={{ flex: 1 }} p="lg">
              <Stack gap="lg" maw={760}>
                {turns.map((turn) => {
                  const attribution = attributionOf(turn.label);
                  const color = colorOf(turn.label);
                  return (
                    <div key={turn.key}>
                      <Group gap="xs" mb={4}>
                        <SpeakerAssignPopover
                          channelId={channelId}
                          uploadId={uploadId}
                          label={turn.label}
                          attribution={attribution}
                          ownSpeakers={ownSpeakers}
                          onStage={stageAttribution}
                          onChannelSpeakersChanged={invalidateChannelSpeakers}
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
                          <Group gap={6}>
                            <Text fw={700} c={`${color}.5`} size="sm">
                              {attribution
                                ? attribution.speakerName
                                : displayLabel(turn.label)}
                            </Text>
                            <IconDotsVertical
                              size={13}
                              style={{ opacity: 0.5 }}
                            />
                          </Group>
                        </SpeakerAssignPopover>
                        <Text size="xs" c="dimmed">
                          {formatTimestamp(turn.start)}
                        </Text>
                      </Group>
                      <Text
                        size="sm"
                        style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                      >
                        {turn.text}
                      </Text>
                    </div>
                  );
                })}
              </Stack>
            </ScrollArea>

            {/* People */}
            <div
              style={{
                width: 320,
                borderLeft: '1px solid var(--mantine-color-default-border)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <Text fw={600} size="sm" px="md" pt="md" pb="xs">
                People
              </Text>
              <ScrollArea style={{ flex: 1 }} px="xs">
                <Stack gap={2} pb="sm">
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
                </Stack>
              </ScrollArea>
              <Divider />
              <div style={{ padding: 'var(--mantine-spacing-sm)' }}>
                <AddSpeakerInput
                  channelId={channelId}
                  onChanged={invalidateChannelSpeakers}
                />
              </div>
            </div>
          </div>

          {/* Footer — nothing is written until Save. */}
          <Group
            justify="space-between"
            px="lg"
            py="sm"
            style={{
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Text size="xs" c="dimmed">
              {hasChanges
                ? 'Unsaved changes — saving re-indexes this upload once.'
                : 'No unsaved changes.'}
            </Text>
            <Group gap="sm">
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
            </Group>
          </Group>
        </div>
      )}
    </Modal>
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
    <Group gap={4} wrap="nowrap" align="center">
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
        <Group gap="sm" wrap="nowrap">
          <Avatar size="sm" color={color} radius="xl">
            {(attribution?.speakerName ?? displayLabel(label))
              .charAt(0)
              .toUpperCase()}
          </Avatar>
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
        </Group>
      </SpeakerAssignPopover>
      {strongMatch ? (
        <Tooltip
          label={`Assign ${strongMatch.name} · ${strongMatch.matchPercent}% voice match`}
        >
          <Button
            size="compact-xs"
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
    </Group>
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
      query: trimmed,
    }),
    enabled: opened && trimmed.length >= 2,
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
  const others = othersQuery.data?.results ?? [];
  const ownNames = new Set(ownSpeakers.map((s) => s.name.toLowerCase()));
  const canCreate = trimmed.length > 0 && !ownNames.has(trimmed.toLowerCase());

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={position}
      withinPortal
      trapFocus
      width={300}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((v) => !v)}
          className={triggerClassName}
          style={triggerStyle}
        >
          {children}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <div style={{ padding: 'var(--mantine-spacing-xs)' }}>
          {/* The detected diarization label is surfaced only here — once
              assigned, the transcript/sidebar show the person's name. */}
          <Text size="xs" c="dimmed" mb={4}>
            Detected: {displayLabel(label)}
          </Text>
          <TextInput
            placeholder="Assign to a person…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            size="sm"
            data-autofocus
          />
        </div>
        <ScrollArea.Autosize mah={360}>
          <Stack gap={2} px="xs" pb="xs">
            {attribution ? (
              <>
                <Button
                  variant="subtle"
                  color="red"
                  justify="flex-start"
                  size="compact-sm"
                  leftSection={<IconUserOff size={14} />}
                  onClick={() => stage(null)}
                >
                  Remove {attribution.speakerName}
                </Button>
                <Divider my={2} />
              </>
            ) : null}

            {!trimmed && suggestions.length > 0 ? (
              <>
                <Text size="xs" c="dimmed" px={4} pt={2}>
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
                <Divider my={2} />
              </>
            ) : null}

            {filteredOwn.length > 0 ? (
              <>
                <Text size="xs" c="dimmed" px={4} pt={2}>
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
                <Text size="xs" c="dimmed" px={4} pt={6}>
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
            ) : trimmed.length >= 2 && othersQuery.isFetching ? (
              <Group justify="center" py="xs">
                <Loader size="xs" />
              </Group>
            ) : null}

            {canCreate ? (
              <>
                <Divider my={2} />
                <Button
                  variant="light"
                  justify="flex-start"
                  size="compact-sm"
                  leftSection={<IconPlus size={14} />}
                  loading={createMutation.isPending}
                  onClick={createAndAssign}
                >
                  Create “{trimmed}”
                </Button>
              </>
            ) : null}

            {/* Turn menu only: move this turn's paragraphs to a different local
                speaker label (a paragraph override), distinct from assigning a
                person above. */}
            {turnMenu ? (
              <>
                <Divider my={2} />
                {turnMenu.hasOverride ? (
                  <Button
                    variant="subtle"
                    color="gray"
                    justify="flex-start"
                    size="compact-sm"
                    leftSection={<IconArrowBackUp size={14} />}
                    onClick={doReset}
                  >
                    Reset to detected speaker
                  </Button>
                ) : null}
                <Text size="xs" c="dimmed" px={4} pt={2}>
                  Move this turn to another speaker
                </Text>
                {turnMenu.otherLabels.map((l) => (
                  <Button
                    key={l}
                    variant="subtle"
                    color="gray"
                    justify="flex-start"
                    size="compact-sm"
                    onClick={() => doReassign(l)}
                  >
                    {displayLabel(l)}
                  </Button>
                ))}
                <Group gap="xs" align="flex-end" px={4} pt={4}>
                  <TextInput
                    size="xs"
                    placeholder="New label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    variant="light"
                    disabled={newLabel.trim().length === 0}
                    onClick={() => doReassign(newLabel)}
                  >
                    <IconPlus size={16} />
                  </ActionIcon>
                </Group>
              </>
            ) : null}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

function PickerRow({
  name,
  subtitle,
  selected = false,
  sparkle = false,
  icon,
  badge,
  matchPercent,
  onClick,
}: {
  name: string;
  subtitle?: string;
  selected?: boolean;
  sparkle?: boolean;
  icon?: ReactNode;
  badge?: { label: string; color: string };
  matchPercent?: number | null;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{ padding: '5px 8px' }}
      className={styles.row}
    >
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {sparkle ? (
            <IconSparkles
              size={14}
              style={{ color: 'var(--mantine-color-indigo-5)' }}
            />
          ) : icon ? (
            icon
          ) : null}
          <div style={{ minWidth: 0 }}>
            <Text size="sm" truncate>
              {name}
            </Text>
            {subtitle ? (
              <Text size="xs" c="dimmed" truncate>
                {subtitle}
              </Text>
            ) : null}
          </div>
        </Group>
        <Group gap={6} wrap="nowrap">
          {typeof matchPercent === 'number' ? (
            <Text
              size="xs"
              c="dimmed"
              fw={500}
              style={{ fontVariant: 'tabular-nums' }}
            >
              {matchPercent}%
            </Text>
          ) : null}
          {badge ? (
            <Badge size="xs" variant="light" color={badge.color}>
              {badge.label}
            </Badge>
          ) : selected ? (
            <IconCheck size={16} />
          ) : null}
        </Group>
      </Group>
    </UnstyledButton>
  );
}

// "Add a speaker…" — create a channel speaker (immediately, so it can be
// assigned). Distinct from the staged labeling: it adds to the library.
function AddSpeakerInput({
  channelId,
  onChanged,
}: {
  channelId: string;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [name, setName] = useState('');
  const createMutation = useMutation(
    trpc.dashboard.channels.createSpeaker.mutationOptions({
      onSuccess: () => {
        setName('');
        onChanged();
      },
      onError: (error) =>
        showFailure({ message: error.message || 'Failed to add speaker' }),
    }),
  );

  const submit = () => {
    if (name.trim().length === 0) return;
    createMutation.mutate({ channelId, name: name.trim() });
  };

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap">
      <TextInput
        placeholder="Add a speaker…"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        size="sm"
        style={{ flex: 1 }}
      />
      <Tooltip label="Add speaker">
        <ActionIcon
          variant="light"
          size="lg"
          loading={createMutation.isPending}
          disabled={name.trim().length === 0}
          onClick={submit}
        >
          <IconPlus size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
