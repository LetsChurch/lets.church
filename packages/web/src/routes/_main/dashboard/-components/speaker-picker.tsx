import { Combobox } from '@base-ui/react/combobox';
import { IconCheck, IconPlus, IconSparkles } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { Badge, Loader, Text } from '@/components/ui';
import { controlClasses } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

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
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '5px 8px' }}
      className={`block cursor-pointer appearance-none border-0 bg-transparent text-left ${styles.row}`}
    >
      <div className="flex flex-nowrap items-center justify-between gap-2.5">
        <div
          style={{ minWidth: 0 }}
          className="flex flex-nowrap items-center justify-start gap-[6px]"
        >
          {sparkle ? (
            <IconSparkles size={14} className="text-indigo-500" />
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
        </div>
        <div className="flex flex-nowrap items-center justify-start gap-[6px]">
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
        </div>
      </div>
    </button>
  );
}

// Unified speaker picker: an accessible Base UI Combobox whose popup offers a
// "Create …" action (when `onCreate` is given and the typed name has no exact
// match) followed by the matching existing speakers. Results float in a popover,
// so it doesn't reflow its container. Scope to a channel's assignable pool with
// `channelId`, or omit it to search every channel; `excludeId` drops one speaker
// (e.g. a merge's own source).
type SpeakerItem =
  | { kind: 'create'; name: string }
  | { kind: 'existing'; speaker: PickedSpeaker };

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
    // doesn't collapse and reflow on each keystroke.
    placeholderData: keepPreviousData,
  });
  const results = enabled ? (speakersQuery.data?.results ?? []) : [];
  // Offer Create only when a name is typed and no exact (case-insensitive)
  // existing match is already shown.
  const hasExact = results.some(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !hasExact;

  // The create action is the first item (a sentinel) so onValueChange can tell
  // it apart from picking an existing speaker.
  const items: SpeakerItem[] = [
    ...(canCreate ? [{ kind: 'create' as const, name: trimmed }] : []),
    ...results.map((r) => ({ kind: 'existing' as const, speaker: r })),
  ];

  return (
    <Combobox.Root
      items={items}
      value={null}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(item: SpeakerItem | null) => {
        if (!item || busy) return;
        if (item.kind === 'create') onCreate?.(item.name);
        else onPickExisting(item.speaker);
      }}
      // Results are searched server-side; skip Base UI's client filter.
      filter={null}
      itemToStringLabel={(item: SpeakerItem) =>
        item.kind === 'create' ? item.name : item.speaker.name
      }
    >
      <div className="relative">
        <Combobox.Input
          placeholder={placeholder}
          data-autofocus={autoFocus || undefined}
          className={cn(controlClasses(), 'pr-8')}
        />
        {enabled && speakersQuery.isFetching ? (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2.5">
            <Loader size="xs" />
          </span>
        ) : null}
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-[60]">
          <Combobox.Popup className="border-fancy-pants max-h-72 w-[var(--anchor-width)] overflow-y-auto rounded-lg bg-white p-1 shadow-lg dark:bg-zinc-900">
            <Combobox.Empty className="text-secondary px-3 py-2 text-xs empty:hidden">
              {!enabled
                ? 'Type at least two characters to search.'
                : speakersQuery.isFetching
                  ? 'Searching…'
                  : 'No speakers found.'}
            </Combobox.Empty>
            <Combobox.List>
              {(item: SpeakerItem) =>
                item.kind === 'create' ? (
                  <Combobox.Item
                    key="__create__"
                    value={item}
                    className="text-brand data-[highlighted]:bg-brand/10 flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
                  >
                    <IconPlus size={14} />
                    <span>
                      {createLabel} “{item.name}”
                    </span>
                  </Combobox.Item>
                ) : (
                  <Combobox.Item
                    key={item.speaker.speakerId}
                    value={item}
                    className="data-[highlighted]:bg-brand/10 flex cursor-default flex-col rounded-md px-2 py-1.5"
                  >
                    <Text size="sm" truncate>
                      {item.speaker.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {item.speaker.channelName}
                    </Text>
                  </Combobox.Item>
                )
              }
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
