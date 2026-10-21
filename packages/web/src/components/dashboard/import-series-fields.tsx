import { useQuery } from '@tanstack/react-query';

import { Select, TextInput } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

export type ImportSeriesState = {
  mode: 'none' | 'new' | 'existing';
  title: string;
  seriesId: string;
};

export const emptyImportSeries: ImportSeriesState = {
  mode: 'none',
  title: '',
  seriesId: '',
};

/** The `series` input for `bulkImportMedia` / `importFeed`. */
export function importSeriesInput(state: ImportSeriesState) {
  if (state.mode === 'new') {
    return { mode: 'new' as const, title: state.title.trim() };
  }
  if (state.mode === 'existing') {
    return { mode: 'existing' as const, seriesId: state.seriesId };
  }
  return undefined;
}

export function isImportSeriesComplete(state: ImportSeriesState) {
  if (state.mode === 'new') return state.title.trim().length > 0;
  if (state.mode === 'existing') return state.seriesId.length > 0;
  return true;
}

/**
 * Pick where a batch import lands: nowhere, a new series, or the end of one of
 * the channel's existing series. Items keep their source order either way.
 */
export function ImportSeriesFields({
  channelId,
  value,
  onChange,
}: {
  channelId: string;
  value: ImportSeriesState;
  onChange: (value: ImportSeriesState) => void;
}) {
  const trpc = useTRPC();
  const { data: playlists = [] } = useQuery({
    ...trpc.dashboard.channels.getChannelPlaylists.queryOptions({ channelId }),
    enabled: value.mode === 'existing',
  });
  const seriesOptions = playlists
    .filter((playlist) => playlist.type === 'SERIES')
    .map((playlist) => ({
      value: playlist.id,
      label: `${playlist.title} (${playlist._count.uploads})`,
    }));

  return (
    <>
      <Select
        label="Series"
        description="Imported items keep their order within the series."
        data={[
          { value: 'none', label: 'No series' },
          { value: 'new', label: 'Create a new series' },
          { value: 'existing', label: 'Add to an existing series' },
        ]}
        value={value.mode}
        onChange={(mode) =>
          onChange({ ...value, mode: mode as ImportSeriesState['mode'] })
        }
      />

      {value.mode === 'new' ? (
        <TextInput
          label="Series title"
          required
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.currentTarget.value })}
        />
      ) : null}

      {value.mode === 'existing' ? (
        <Select
          label="Existing series"
          description="New items are added after the series' current uploads."
          placeholder={
            seriesOptions.length > 0 ? 'Choose a series' : 'No series yet'
          }
          data={seriesOptions}
          value={value.seriesId}
          onChange={(seriesId) => onChange({ ...value, seriesId })}
        />
      ) : null}
    </>
  );
}
