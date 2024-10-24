import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import {
  array,
  number,
  object,
  optional,
  parse,
  string,
  unknown,
  type Input,
} from 'valibot';
import { useSearchParams } from '@solidjs/router';
import { Optional, cn } from '../../../util';
import ListHeading from './list-heading';
import { getMenuColorClass, optionId } from './util';
import ResultRow from './result-row';

export const locationSlug = 'location';

const mbAccessToken = import.meta.env['VITE_MAPBOX_SEARCHBOX_TOKEN'];
const sessionToken = window.crypto.randomUUID();

export const murica = [-97.9222112121185, 39.3812661305678] as [number, number];
const defaultRange = '100 mi';

const suggestionSchema = object(
  {
    name: string(),
    feature_type: string(),
    address: optional(string()),
    full_address: optional(string()),
    place_formatted: string(),
    mapbox_id: string(),
  },
  unknown(),
);

const locationSuggestSchema = object(
  {
    suggestions: array(suggestionSchema),
  },
  unknown(),
);

const reverseGeocodeSchema = object(
  {
    features: array(
      object(
        {
          place_name: string(),
        },
        unknown(),
      ),
    ),
  },
  unknown(),
);

async function reverseGeocode([long, lat]: [number, number]): Promise<
  Input<typeof reverseGeocodeSchema>
> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${long},${lat}.json?access_token=${mbAccessToken}`,
  );

  return parse(reverseGeocodeSchema, await res.json());
}

const retrieveSchema = object(
  {
    features: array(
      object(
        {
          properties: object(
            {
              coordinates: object({ longitude: number(), latitude: number() }),
            },
            unknown(),
          ),
        },
        unknown(),
      ),
    ),
  },
  unknown(),
);

async function retrieve(id: string): Promise<Input<typeof retrieveSchema>> {
  const res = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${id}?session_token=${sessionToken}&access_token=${mbAccessToken}`,
  );

  return parse(retrieveSchema, await res.json());
}

export const useParsedLocation = () => {
  const [searchParams] = useSearchParams();

  const parsed = createMemo(() => ({
    range:
      searchParams['range'] ??
      (searchParams['center'] ? defaultRange : '25000 mi'),
    center:
      (searchParams['center']?.split(',').map(parseFloat).slice(0, 2) as [
        number,
        number,
      ]) ?? murica,
  }));

  return parsed;
};

type LocationSuggestion = {
  name: string;
  location: string;
  type: string;
  mapboxId: string;
};

export function locationState(clearInput: () => unknown) {
  const [locationLabel, setLocationLabel] = createSignal<string | null>(null);
  const [locationSuggestions, setLocationSuggestions] =
    createSignal<null | Array<LocationSuggestion>>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  onMount(async () => {
    const center = searchParams['center'];

    if (center) {
      const res = await reverseGeocode(
        center.split(',').slice(0, 2).map(parseFloat) as [number, number],
      );
      setLocationLabel(res.features[0]?.place_name ?? null);
    }
  });

  const locationChiclet = createMemo(() => {
    const locLab = locationLabel();
    const range = searchParams['range'] ?? defaultRange;

    const locChiclet = locLab
      ? [
          {
            color: 'YELLOW' as const,
            slug: locationSlug,
            label: `${range} of ${locLab}`,
          },
        ]
      : [];

    return locChiclet;
  });

  async function fetchLocationSuggestions(input: string): Promise<void> {
    if (locationLabel() || !input) {
      return;
    }

    const res = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(input)}&limit=3&language=en&types=country,region,prefecture,postcode,district,place,city,locality,neighborhood,block,street,address&session_token=${sessionToken}&access_token=${mbAccessToken}`,
    );

    const data = parse(locationSuggestSchema, await res.json());
    setLocationSuggestions(
      data?.suggestions.map((r) => ({
        name: r.name,
        location: r.place_formatted,
        type: r.feature_type,
        mapboxId: r.mapbox_id,
      })),
    );
  }

  async function addLocationFromSuggestion(suggestion: LocationSuggestion) {
    const res = await retrieve(suggestion.mapboxId);
    const coordinates = res.features[0]?.properties.coordinates;

    setSearchParams({
      center: [
        coordinates?.longitude ?? murica[0],
        coordinates?.latitude ?? murica[1],
      ].join(','),
    });
    setLocationSuggestions(null);
    setLocationLabel(suggestion.location);

    clearInput();
  }

  return {
    locationLabel,
    setLocationLabel,
    locationChiclet,
    locationSuggestions,
    addLocationFromSuggestion,
    fetchLocationSuggestions,
    clearLocationSuggestions: () => setLocationSuggestions(null),
  };
}

export function LocationMenu(props: {
  locationLabel: string | null;
  locationSuggestions: Array<LocationSuggestion> | null;
  addLocationFromSuggestion: (suggestion: LocationSuggestion) => unknown;
  range?: string;
  onClearLocation: () => unknown;
  optionPrefix: string;
  activeOptionId?: Optional<string>;
}) {
  const [, setSearchParams] = useSearchParams();

  function onSelectRange(range: string) {
    setSearchParams({ range });
  }

  return (
    <Show
      when={props.locationLabel}
      keyed
      fallback={
        <li>
          <ListHeading>Location</ListHeading>
          <Show
            when={props.locationSuggestions}
            keyed
            fallback={
              <h2 class="pl-4 text-sm text-gray-950">Type to search</h2>
            }
          >
            {(results) => (
              <ul class="text-sm text-gray-700">
                <For each={results} fallback={<li>No results</li>}>
                  {(result, i) => (
                    <ResultRow
                      id={optionId(props.optionPrefix, locationSlug, i())}
                      activeId={props.activeOptionId}
                      onClick={() => props.addLocationFromSuggestion(result)}
                    >
                      <div
                        class={cn(
                          'ml-2 size-2 rounded-full',
                          getMenuColorClass('YELLOW'),
                        )}
                        role="presentation"
                      />
                      <dl class="min-w-0 pl-2">
                        <dt class="block overflow-hidden text-ellipsis whitespace-nowrap font-bold">
                          {result.name}
                        </dt>
                        <dd class="block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-gray-950">
                          {result.location}
                        </dd>
                      </dl>
                    </ResultRow>
                  )}
                </For>
              </ul>
            )}
          </Show>
        </li>
      }
    >
      {(label) => (
        <>
          <ListHeading>{label}</ListHeading>
          <div class="my-2 flex flex-row gap-2 px-2">
            <select
              class="block shrink rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
              onChange={(e) => onSelectRange(e.target.value)}
              value={props.range ?? defaultRange}
              onClick={(e) => e.stopPropagation()}
            >
              <option>5 mi</option>
              <option>10 mi</option>
              <option>25 mi</option>
              <option>50 mi</option>
              <option>100 mi</option>
              <option>200 mi</option>
              <option>500 mi</option>
              <option>1000 mi</option>
            </select>
            <button
              type="button"
              class="grow rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              onClick={props.onClearLocation}
            >
              Clear Location
            </button>
          </div>
        </>
      )}
    </Show>
  );
}
