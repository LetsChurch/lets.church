import {
  Badge,
  Button,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconPlus, IconSparkles } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTRPC } from '@/trpc/react';
import styles from './speaker-picker.module.css';

export type PickedSpeaker = {
  speakerId: string;
  name: string;
  channelId: string;
  channelName: string;
};

// One selectable speaker row — the shared visual used by both the upload
// labeling modal's picker and the admin speaker pickers (merge / queue).
export function PickerRow({
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

// Unified speaker picker mirroring the labeling modal's dropdown: a search field
// with a fixed "Create …" header action (when `onCreate` is given and the typed
// name has no exact match), then the matching existing speakers as PickerRows.
// Scope to a channel's assignable pool with `channelId`, or omit it to search
// every channel; `excludeId` drops one speaker (e.g. a merge's own source).
export function SpeakerPicker({
  channelId,
  excludeId,
  onPickExisting,
  onCreate,
  createLabel = 'Create',
  busy = false,
  autoFocus = false,
  placeholder = 'Search speakers by name…',
}: {
  channelId?: string;
  excludeId?: string;
  onPickExisting: (speaker: PickedSpeaker) => void;
  onCreate?: (name: string) => void;
  createLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // Debounced so the search doesn't refetch on every keystroke; the Create
  // action still uses the immediate `trimmed` value.
  const [debounced] = useDebouncedValue(trimmed, 200);
  const enabled = debounced.length >= 2;

  const speakersQuery = useQuery({
    ...trpc.dashboard.admin.searchSpeakers.queryOptions({
      query: debounced,
      channelId,
      excludeId,
    }),
    enabled,
    // Keep prior results on screen while the next search loads so the list
    // doesn't collapse and reflow (shoving the Create button around) on each
    // keystroke.
    placeholderData: keepPreviousData,
  });
  const results = enabled ? (speakersQuery.data?.results ?? []) : [];
  // Offer Create only when a name is typed and no exact (case-insensitive)
  // existing match is already shown.
  const hasExact = results.some(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !hasExact;

  return (
    <Stack gap="xs">
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={placeholder}
        size="sm"
        data-autofocus={autoFocus || undefined}
        rightSection={
          enabled && speakersQuery.isFetching ? <Loader size="xs" /> : null
        }
      />
      {/* Create is a fixed header action so it's always offered and never moves
          as search results stream in below. */}
      {canCreate ? (
        <Button
          variant="light"
          justify="flex-start"
          size="compact-sm"
          fullWidth
          leftSection={<IconPlus size={14} />}
          loading={busy}
          onClick={() => onCreate?.(trimmed)}
        >
          {createLabel} “{trimmed}”
        </Button>
      ) : null}
      <ScrollArea.Autosize mah={300}>
        <Stack gap={2}>
          {!enabled ? (
            <Text size="xs" c="dimmed" px={4}>
              Type at least two characters to search.
            </Text>
          ) : results.length > 0 ? (
            results.map((r) => (
              <PickerRow
                key={r.speakerId}
                name={r.name}
                subtitle={r.channelName}
                onClick={() => {
                  if (!busy) onPickExisting(r);
                }}
              />
            ))
          ) : speakersQuery.isFetching ? null : (
            <Text size="xs" c="dimmed" px={4}>
              No speakers found.
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
