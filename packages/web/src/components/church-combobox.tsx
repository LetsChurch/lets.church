import { Combobox } from '@base-ui-components/react/combobox';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { array, looseObject, string } from 'zod';
import { Tag } from '@/components/tag';
import type { ParsedFilters } from '@/routes/_main/churches';
import { useTRPC } from '@/trpc/react';

const suggestionSchema = looseObject({
  name: string(),
  feature_type: string(),
  address: string().optional(),
  full_address: string().optional(),
  place_formatted: string(),
  mapbox_id: string(),
});

const locationSuggestSchema = looseObject({
  suggestions: array(suggestionSchema),
});

type MenuItem = {
  id: string;
  label: string;
  type: 'location' | 'tag' | 'organization';
  color?: string;
  subtitle?: string;
};
type MenuGroup = { value: string; items: Array<MenuItem> };

// Get the background color class for a tag color
function getTagColorClass(color: string): string {
  switch (color) {
    case 'BLUE':
      return 'bg-blue-500';
    case 'GREEN':
      return 'bg-green-500';
    case 'RED':
      return 'bg-red-500';
    case 'INDIGO':
      return 'bg-indigo-500';
    case 'PINK':
      return 'bg-pink-500';
    case 'PURPLE':
      return 'bg-purple-500';
    case 'GRAY':
      return 'bg-gray-500';
    default:
      return 'bg-gray-500';
  }
}

export type ChurchComboboxProps = {
  filters: ParsedFilters;
  onNavigate: (options: {
    center?: string;
    organization?: string;
    tag?: string;
  }) => void;
  hideOrganization?: boolean;
};

export function ChurchCombobox({
  filters,
  onNavigate,
  hideOrganization = false,
}: ChurchComboboxProps) {
  const id = useId();
  const sessionToken = useMemo(() => window.crypto.randomUUID(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue] = useDebounce(searchValue, 200);

  // Ephemeral state for location label (not persisted to URL)
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  // trpc Queries
  const trpc = useTRPC();
  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  // Check if there's already a selected location
  const hasSelectedLocation =
    filters.center && filters.center[0] !== -97.9222112121185;

  // Mapbox Query
  const { data: locations, isFetching: isLocationsFetching } = useQuery({
    queryKey: ['mapbox', debouncedSearchValue],
    queryFn: async () => {
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(debouncedSearchValue)}&limit=3&language=en&types=country,region,prefecture,postcode,district,place,city,locality,neighborhood,block,street,address&session_token=${sessionToken}&access_token=${env?.MAPBOX_SEARCHBOX_TOKEN}`,
      );
      const data = locationSuggestSchema.parse(await res.json());

      return data.suggestions.map((r) => ({
        name: r.name,
        location: r.place_formatted,
        type: r.feature_type,
        mapboxId: r.mapbox_id,
      }));
    },
    enabled:
      debouncedSearchValue.trim().length > 0 &&
      !!env?.MAPBOX_SEARCHBOX_TOKEN &&
      !hasSelectedLocation,
  });

  // Function to retrieve full location details including coordinates
  const retrieveLocation = async (mapboxId: string) => {
    if (!env?.MAPBOX_SEARCHBOX_TOKEN) return null;

    const res = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?session_token=${sessionToken}&access_token=${env.MAPBOX_SEARCHBOX_TOKEN}`,
    );
    const data = await res.json();

    if (data.features?.[0]?.geometry?.coordinates) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return { lng, lat };
    }
    return null;
  };
  const { data: tags } = useQuery(
    trpc.church.getOrganizationTags.queryOptions(),
  );

  // Fetch the selected organization if it exists (for displaying the chip)
  const { data: selectedOrganization } = useQuery({
    ...trpc.church.getOrganizationBySlug.queryOptions({
      slug: filters.organizationSlug ?? '',
    }),
    enabled: !!filters.organizationSlug,
    select: (data) => {
      if (!data || !filters.organizationSlug) return null;
      return {
        id: data.id,
        slug: filters.organizationSlug,
        name: data.name,
      };
    },
  });

  const { data: organizations, isFetching: isOrganizationsFetching } = useQuery(
    {
      ...trpc.church.searchMinistries.queryOptions({
        query: debouncedSearchValue,
      }),
      enabled: debouncedSearchValue.trim().length > 0 && !hideOrganization,
    },
  );

  const groupedTags = useMemo(
    () => Object.groupBy(tags ?? [], (node) => node.category),
    [tags],
  );
  const tagGroups = useMemo(
    () =>
      Object.keys(groupedTags)
        .sort()
        .map((cat) => ({
          category: cat,
          tags: groupedTags[cat as keyof typeof groupedTags],
        })),
    [groupedTags],
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const trimmedSearchValue = searchValue.trim();

  const isBusy = isLocationsFetching || isOrganizationsFetching;

  // Compute selected values from query params
  const selectedValues = useMemo(() => {
    const values: MenuItem[] = [];

    // Add location if present (coordinates from query param)
    if (filters.center && filters.center[0] !== -97.9222112121185) {
      // Not default MURICA center
      const [lng, lat] = filters.center;
      values.push({
        id: `${lng},${lat}`, // Use coordinates as ID for matching
        label: locationLabel ?? 'Selected Location', // Use ephemeral label if available
        type: 'location',
        subtitle: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      });
    }

    // Add organization if present
    if (filters.organizationSlug) {
      // Try to find in search results first, otherwise use selectedOrganization
      const org =
        organizations?.find((o) => o.slug === filters.organizationSlug) ??
        selectedOrganization;
      if (org) {
        values.push({
          id: org.slug,
          label: org.name,
          type: 'organization',
        });
      }
    }

    // Add tags if present
    if (filters.tags.length > 0 && tags) {
      for (const tagSlug of filters.tags) {
        const tag = tags.find((t) => t.slug === tagSlug);
        if (tag) {
          values.push({
            id: tag.slug,
            label: tag.label,
            type: 'tag',
            color: tag.color,
          });
        }
      }
    }

    return values;
  }, [
    filters.center,
    filters.organizationSlug,
    filters.tags,
    organizations,
    selectedOrganization,
    tags,
    locationLabel,
  ]);

  const selectedValuesRef = useRef<MenuItem[]>(selectedValues);

  // Keep ref in sync with selectedValues
  selectedValuesRef.current = selectedValues;

  const menuItems: Array<MenuGroup> = useMemo(() => {
    // Build location items from search results
    const locationItems: MenuItem[] =
      locations?.map((loc) => ({
        id: loc.mapboxId,
        label: loc.name,
        type: 'location' as const,
        subtitle: loc.location,
      })) ?? [];

    // Find any selected location that might not be in current search results
    // Check if the selected item has a subtitle (indicates it's a location)
    const selectedLocation = selectedValues.find(
      (item) => item.type === 'location',
    );

    // Add selected location if it exists and it's not already in the search results
    if (
      selectedLocation &&
      !locationItems.some((loc) => loc.id === selectedLocation.id)
    ) {
      locationItems.unshift(selectedLocation);
    }

    const items = [
      {
        value: 'Locations',
        items: locationItems,
      },
      ...tagGroups.map((group) => ({
        value: group.category,
        items:
          group.tags?.map((tag) => ({
            id: tag.slug,
            label: tag.label,
            type: 'tag' as const,
            color: tag.color,
          })) ?? [],
      })),
      // Only show organizations if not hidden
      ...(!hideOrganization
        ? [
            {
              value: 'Organizations',
              items:
                organizations?.map((org) => ({
                  id: org.slug,
                  label: org.name,
                  type: 'organization' as const,
                })) ?? [],
            },
          ]
        : []),
    ];
    return items;
  }, [locations, tagGroups, organizations, selectedValues, hideOrganization]);

  function getEmptyMessage() {
    if (trimmedSearchValue === '') {
      return null;
    }

    return 'Try a different search term.';
  }

  // Custom filter function to filter tags by search value
  const filterItems = (item: MenuItem, searchValue: string) => {
    const search = searchValue.toLowerCase().trim();
    if (!search) return true;

    // Don't filter locations or organizations - they come from API search
    if (item.type === 'location' || item.type === 'organization') return true;

    // Filter tags by label
    return item.label.toLowerCase().includes(search);
  };

  return (
    <Combobox.Root<MenuItem, MenuItem, true>
      items={menuItems}
      value={selectedValues}
      multiple
      filter={filterItems}
      onValueChange={async (nextSelectedValues: MenuItem[]) => {
        // Find all locations in both arrays
        const newLocations = nextSelectedValues.filter(
          (item) => item.type === 'location',
        );
        const oldLocations = selectedValuesRef.current.filter(
          (item) => item.type === 'location',
        );

        // If we have more than one location, keep only the most recently added one
        let finalValues = nextSelectedValues;
        if (newLocations.length > 1) {
          // Remove all old locations, keeping only the new one
          finalValues = nextSelectedValues.filter(
            (item) =>
              item.type !== 'location' ||
              !oldLocations.some((old) => old.id === item.id),
          );
        }

        selectedValuesRef.current = finalValues;

        // Extract query params from selected values
        const location = finalValues.find((item) => item.type === 'location');
        const org = finalValues.find((item) => item.type === 'organization');
        const selectedTags = finalValues.filter((item) => item.type === 'tag');

        // If a new location was selected, retrieve its coordinates and save label
        let centerParam: string | undefined;
        if (location) {
          // Check if the location ID is already coordinates (lng,lat format) or a mapboxId
          if (location.id.includes(',') && !location.id.includes('dXJu')) {
            // Already coordinates format, reuse it
            centerParam = location.id;
          } else {
            // It's a mapboxId, retrieve the coordinates
            const coords = await retrieveLocation(location.id);
            if (coords) {
              centerParam = `${coords.lng},${coords.lat}`;
              // Save the location label to ephemeral state
              setLocationLabel(location.label);
            }
          }
        } else {
          // Location was removed, clear the label
          setLocationLabel(null);
        }

        // Update query params (replace to avoid flash)
        onNavigate({
          center: centerParam,
          organization: org?.id,
          tag:
            selectedTags.length > 0
              ? selectedTags.map((t) => t.id).join(',')
              : undefined,
        });

        setSearchValue('');
      }}
      onInputValueChange={(nextSearchValue, { reason }) => {
        setSearchValue(nextSearchValue);

        const controller = new AbortController();
        abortControllerRef.current?.abort();
        abortControllerRef.current = controller;

        if (reason === 'item-press') {
          return;
        }
      }}
    >
      <div className="flex flex-col gap-1 font-medium text-sm">
        <label className="sr-only" htmlFor={id}>
          Search churches by name, address, doctrine, or practice
        </label>
        <Combobox.Chips
          className="relative flex min-h-10 flex-wrap items-center gap-1 rounded-3xl border border-gray-950/10 bg-gray-950/5 px-3 py-1 transition-all duration-200 focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_--theme(--color-white/0.2),0_0_20px_--theme(--color-white/0.3)] hover:border-gray-950/20 hover:bg-gray-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
          ref={containerRef}
        >
          <Combobox.Value>
            {(value: Array<MenuItem>) => {
              // Filter out organizations if they should be hidden
              const visibleValues = value.filter((item) => {
                // Skip organization chips if hideOrganization is true
                if (hideOrganization && item.type === 'organization') {
                  return false;
                }
                return true;
              });

              return (
                <>
                  {visibleValues.map((item) =>
                    item.type === 'tag' ? (
                      <Combobox.Chip
                        key={item.id}
                        className="flex cursor-default items-center gap-1 outline-none"
                        aria-label={item.label}
                      >
                        <Tag
                          size="md"
                          color={
                            item.color as
                              | 'BLUE'
                              | 'GREEN'
                              | 'RED'
                              | 'INDIGO'
                              | 'PINK'
                              | 'PURPLE'
                              | 'GRAY'
                          }
                          className="pr-1"
                        >
                          {item.label}
                          <Combobox.ChipRemove
                            className="ml-1 inline-flex items-center justify-center rounded-full border-none bg-transparent p-0.5 text-inherit opacity-50 transition-opacity hover:opacity-100"
                            aria-label="Remove"
                          >
                            <IconX size={14} />
                          </Combobox.ChipRemove>
                        </Tag>
                      </Combobox.Chip>
                    ) : (
                      <Combobox.Chip
                        key={item.id}
                        className="flex cursor-default items-center gap-1 rounded-full border-fancy-pants bg-white py-1 pr-1 pl-3 text-primary text-sm outline-none transition-colors focus-within:bg-white/10 dark:bg-zinc-900 dark:focus-within:bg-white/10 [@media(hover:hover)]:data-highlighted:bg-white/10 dark:[@media(hover:hover)]:data-highlighted:bg-white/10"
                        aria-label={item.label}
                      >
                        {item.label}
                        <Combobox.ChipRemove
                          className="inline-flex items-center justify-center rounded-full border-none bg-transparent p-1 text-inherit opacity-50 transition-opacity hover:opacity-100"
                          aria-label="Remove"
                        >
                          <IconX size={16} />
                        </Combobox.ChipRemove>
                      </Combobox.Chip>
                    ),
                  )}
                  <Combobox.Input
                    id={id}
                    placeholder={
                      visibleValues.length > 0 ? '' : 'Search churches...'
                    }
                    className="h-8 flex-1 appearance-none border-0 bg-transparent px-1 pb-0.5 font-medium text-primary text-sm leading-none placeholder-gray-950/30 outline-none dark:placeholder-white/30"
                  />
                </>
              );
            }}
          </Combobox.Value>
        </Combobox.Chips>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner
          className="z-50"
          anchor={containerRef}
          sideOffset={8}
        >
          <Combobox.Popup
            className="w-(--anchor-width) overflow-hidden rounded-2xl border-fancy-pants bg-white/90 shadow-xl backdrop-blur-lg dark:bg-black/90"
            aria-busy={isBusy || undefined}
          >
            <Combobox.Empty className="box-border px-4 py-2 text-primary/80 text-sm leading-4 empty:hidden">
              {getEmptyMessage()}
            </Combobox.Empty>
            <Combobox.List className="max-h-80 overflow-y-auto py-2">
              <Combobox.Collection>
                {(group: MenuGroup) => (
                  <Combobox.Group key={group.value}>
                    <Combobox.GroupLabel className="px-4 py-2 font-semibold text-primary/60 text-xs uppercase">
                      {group.value}
                    </Combobox.GroupLabel>
                    {group.items.map((item) => (
                      <Combobox.Item
                        key={item.id}
                        value={item}
                        className="grid cursor-pointer select-none grid-cols-[0.75rem_0.5rem_1fr] items-start gap-2 py-2.5 text-primary/80 text-sm outline-none transition-colors hover:bg-white/10 hover:text-primary data-highlighted:bg-white/10 data-highlighted:text-primary"
                      >
                        <Combobox.ItemIndicator className="col-start-1 mt-1">
                          <IconCheck className="size-3" />
                        </Combobox.ItemIndicator>
                        <div className="col-start-2 mt-1.5 flex items-center justify-center">
                          <div
                            className={`size-2 rounded-full ${item.color ? getTagColorClass(item.color) : 'bg-gray-400 dark:bg-gray-600'}`}
                          />
                        </div>
                        <div className="col-start-3 flex flex-col gap-1">
                          <div className="font-medium">{item.label}</div>
                          {item.subtitle ? (
                            <div className="text-primary/60 text-xs">
                              {item.subtitle}
                            </div>
                          ) : null}
                        </div>
                      </Combobox.Item>
                    ))}
                  </Combobox.Group>
                )}
              </Combobox.Collection>
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
