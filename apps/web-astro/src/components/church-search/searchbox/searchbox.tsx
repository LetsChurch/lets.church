import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from 'solid-js';
import type { ResultOf } from 'gql.tada';
import { useFloating } from 'solid-floating-ui';
import { size, shift } from '@floating-ui/dom';
import { throttle } from '@solid-primitives/scheduled';
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
import type { organizationTagsQuery } from '../../../queries/churches';
import FloatingDiv from '../../floating-div';
import { cn } from '../../../util';
import {
  pushArrayQueryParam,
  pushQueryParams,
  query,
  removeArrayQueryParam,
} from '../../../util/history';
import Chiclet, { type Color } from './chiclet';

const mbAccessToken = import.meta.env.PUBLIC_MAPBOX_SEARCHBOX_TOKEN;
const sessionToken = window.crypto.randomUUID();

type OrgTagQueryNode = ResultOf<
  typeof organizationTagsQuery
>['organizationTagsConnection']['edges'][number]['node'];

function getOrgTagCategoryLabel(category: OrgTagQueryNode['category']): string {
  switch (category) {
    case 'CONFESSION':
      return 'Confession';
    case 'DENOMINATION':
      return 'Denomination';
    case 'DOCTRINE':
      return 'Doctrine';
    case 'ESCHATOLOGY':
      return 'Eschatology';
    case 'GOVERNMENT':
      return 'Government';
    case 'OTHER':
      return 'Other';
    case 'WORSHIP':
      return 'Worship';
  }
}

function getMenuColorClass(color: Color | Uppercase<Color>): string {
  switch (color.toLowerCase() as Color) {
    case 'gray':
      return 'bg-gray-300';
    case 'red':
      return 'bg-red-300';
    case 'yellow':
      return 'bg-yellow-300';
    case 'green':
      return 'bg-green-300';
    case 'blue':
      return 'bg-blue-300';
    case 'indigo':
      return 'bg-indigo-300';
    case 'purple':
      return 'bg-purple-300';
    case 'pink':
      return 'bg-pink-300';
  }
}

export const murica = [-97.9222112121185, 39.3812661305678] as [number, number];

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

const fetchOrgSchema = object({ name: string() });

async function fetchOrg(id: string) {
  const res = await fetch(`/organizations?${new URLSearchParams({ id })}`, {
    headers: { accept: 'application/json' },
  });

  return parse(fetchOrgSchema, await res.json());
}

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

async function getLocationSuggestions(
  input: string,
): Promise<Input<typeof locationSuggestSchema>> {
  const res = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(input)}&language=en&types=country,region,prefecture,postcode,district,place,city,locality,neighborhood,block,street,address&session_token=${sessionToken}&access_token=${mbAccessToken}`,
  );

  return parse(locationSuggestSchema, await res.json());
}

const suggestedOrgSchema = object({
  organization: object({ id: string(), name: string() }),
});

const orgSuggestSchema = array(suggestedOrgSchema);

async function getOrganizationSuggestions(q: string) {
  const res = await fetch(`/organizations?${new URLSearchParams({ q })}`, {
    headers: { accept: 'application/json' },
  });

  return parse(orgSuggestSchema, await res.json());
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

const defaultRange = '100 mi';

export const parsedFilters = () => {
  const memo = createMemo(() => {
    const q = query();

    return {
      range: q.get('range') ?? (q.get('center') ? defaultRange : '25000 mi'),
      center:
        (q.get('center')?.split(',').map(parseFloat).slice(0, 2) as [
          number,
          number,
        ]) ?? murica,
      organization: q.get('organization'),
      tags: q.getAll('tag'),
    };
  });

  return memo;
};

export type Filters = ReturnType<ReturnType<typeof parsedFilters>>;

function ListHeading(props: { children: string }) {
  return (
    <h2 class="sticky top-0 bg-white px-2 pt-1 text-xs font-semibold text-gray-900">
      {props.children}
    </h2>
  );
}

export default function Searchbox() {
  let inputEl: HTMLInputElement;
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [float, setFloat] = createSignal<HTMLDivElement>();
  const [floatOpen, setFloatOpen] = createSignal(false);
  const [locationLabel, setLocationLabel] = createSignal<string | null>(null);
  const [orgLabel, setOrgLabel] = createSignal<string | null>(null);
  const [rawTagData, setRawTagData] = createSignal<Array<OrgTagQueryNode>>([]);
  const filters = parsedFilters();

  const chiclets = createMemo(() => {
    const filterChiclets = filters()
      .tags.map((slug) => rawTagData().find((t) => t.slug === slug))
      .filter(Boolean)
      .sort((a, b) => a.label.length - b.label.length);

    const locLab = locationLabel();
    const q = query();
    const range = q.get('range') ?? defaultRange;

    const locChiclet = locLab
      ? [
          {
            color: 'YELLOW' as const,
            slug: 'location',
            label: `${range} of ${locLab}`,
          },
        ]
      : [];

    const orgLab = orgLabel();

    const orgChiclet = orgLab
      ? [{ color: 'INDIGO' as const, slug: 'organization', label: orgLab }]
      : [];

    return [...locChiclet, ...orgChiclet, ...filterChiclets];
  });

  const floatPosition = useFloating(reference, float, {
    placement: 'bottom-start',
    middleware: [
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
          });
        },
      }),
      shift(),
    ],
  });

  createEffect(() => {
    query();
    floatPosition.update();
  });

  const [inputText, setInputText] = createSignal('');
  const [tagOptionByCategory, setTagOptionsByCategory] =
    createSignal<null | Array<{
      category: OrgTagQueryNode['category'];
      tags: Array<OrgTagQueryNode>;
    }>>(null);

  const filteredTags = () => {
    const needle = inputText().toLowerCase();
    const chics = chiclets();

    if (!needle && chics.length === 0) {
      return [];
    }

    return (
      tagOptionByCategory()?.map((group) => ({
        ...group,
        tags: group.tags
          .filter((t) => t.label.includes(needle) || t.slug.includes(needle))
          .filter((t) => !chics.some((c) => c.slug === t.slug)),
      })) ?? []
    );
  };

  onMount(async () => {
    const res = await fetch('/organization-tags', {
      headers: { accept: 'application/json' },
    });
    const data = (await res.json()) as ResultOf<typeof organizationTagsQuery>;
    setRawTagData(
      data.organizationTagsConnection.edges.map((edge) => edge.node),
    );

    const grouped = Object.groupBy(rawTagData(), (node) => node.category);
    const groups = Object.keys(grouped)
      .sort()
      .map((category) => ({
        category: category as OrgTagQueryNode['category'],
        tags: grouped[category as OrgTagQueryNode['category']] ?? [],
      }));
    setTagOptionsByCategory(groups);
  });

  onMount(async () => {
    const q = query();
    const center = q.get('center');

    if (center) {
      const res = await reverseGeocode(
        center.split(',').slice(0, 2).map(parseFloat) as [number, number],
      );
      setLocationLabel(res.features[0].place_name ?? null);
    }
  });

  onMount(async () => {
    const q = query();
    const orgId = q.get('organization');

    if (orgId) {
      const res = await fetchOrg(orgId);
      setOrgLabel(res.name);
    }
  });

  type LocationSuggestion = {
    name: string;
    location: string;
    type: string;
    mapboxId: string;
  };

  const [locationSuggestions, setLocationSuggestions] =
    createSignal<null | Array<LocationSuggestion>>();
  const [orgSuggestions, setOrgSuggestions] = createSignal<null | Input<
    typeof orgSuggestSchema
  >>(null);

  // eslint-disable-next-line solid/reactivity
  const throttledRemoteSearch = throttle(async (text: string) => {
    if (!text) {
      setLocationSuggestions(null);
    }

    const [locationRes, orgsRes] = await Promise.all([
      locationLabel() ? null : getLocationSuggestions(text),
      orgLabel() ? null : getOrganizationSuggestions(text),
    ] as const);

    batch(() => {
      setLocationSuggestions(
        locationRes?.suggestions.map((r) => ({
          name: r.name,
          location: r.place_formatted,
          type: r.feature_type,
          mapboxId: r.mapbox_id,
        })),
      );

      setOrgSuggestions(orgsRes);
    });
  }, 200);

  createEffect(() => {
    throttledRemoteSearch(inputText());
  });

  async function addLocationFromSuggestion(suggestion: LocationSuggestion) {
    const res = await retrieve(suggestion.mapboxId);
    const coordinates = res.features[0].properties.coordinates;

    pushQueryParams({
      center: [coordinates.longitude, coordinates.latitude].join(','),
    });
    setLocationSuggestions(null);
    setLocationLabel(suggestion.location);

    inputEl.value = '';
    inputEl.focus();
  }

  async function addOrgFromSuggestion({
    organization,
  }: Input<typeof suggestedOrgSchema>) {
    pushQueryParams({
      org: organization.id,
    });
    setOrgSuggestions(null);
    setOrgLabel(organization.name);

    inputEl.value = '';
    inputEl.focus();
  }

  function addTag(tag: OrgTagQueryNode) {
    pushArrayQueryParam('tag', tag.slug);

    inputEl.value = '';
    inputEl.focus();
  }

  function onSelectRange(range: string) {
    pushQueryParams({ range });
  }

  function onClearLocation() {
    pushQueryParams({ range: null, center: null });
    setLocationLabel(null);
  }

  function onClearOrg() {
    pushQueryParams({ organization: null });
    setOrgLabel(null);
  }

  function removeChiclet(chiclet: Pick<OrgTagQueryNode, 'slug'>) {
    if (chiclet.slug === 'location') {
      onClearLocation();
    } else if (chiclet.slug === 'organization') {
      onClearOrg();
    } else {
      removeArrayQueryParam('tag', chiclet.slug);
    }
  }

  return (
    <div
      ref={setReference}
      class="flex cursor-text flex-wrap gap-2 rounded-md px-3 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600"
      onClick={() => {
        inputEl.focus();
        setFloatOpen((o) => !o);
      }}
    >
      <For each={chiclets()}>
        {(chiclet) => (
          <Chiclet
            color={chiclet.color}
            class="shrink-0 grow-0 basis-0 whitespace-nowrap"
            onRemove={() => removeChiclet(chiclet)}
          >
            {chiclet.label}
          </Chiclet>
        )}
      </For>
      <input
        ref={inputEl!}
        class="w-0 min-w-16 shrink grow rounded-md border-0 p-0 text-gray-900 focus:ring-0 sm:text-sm sm:leading-6"
        placeholder={chiclets().length === 0 ? 'Search' : ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.value = '';
          }

          if (e.key === 'Backspace' && e.currentTarget.value === '') {
            const slug = chiclets().at(-1)?.slug;

            if (slug === 'location') {
              onClearLocation();
            } else if (slug === 'organization') {
              onClearOrg();
            } else if (slug) {
              removeArrayQueryParam('tag', slug);
            }
          }

          float()?.scrollTo(0, 0);
        }}
        onInput={(e) => {
          setInputText(e.currentTarget.value);
          setFloatOpen(true);
        }}
      />
      <FloatingDiv
        ref={setFloat}
        open={floatOpen()}
        onClose={() => setFloatOpen(false)}
        position={floatPosition}
        class="relative max-h-64 overflow-y-auto py-0"
      >
        <ul>
          <li>
            <Show
              when={locationLabel()}
              keyed
              fallback={
                <>
                  <ListHeading>Location</ListHeading>
                  <Show
                    when={locationSuggestions()}
                    keyed
                    fallback={
                      <h2 class="pl-4 text-sm text-gray-950">Type to search</h2>
                    }
                  >
                    {(results) => (
                      <ul class="text-sm text-gray-700">
                        <For each={results} fallback={<li>No results</li>}>
                          {(result) => (
                            <li
                              class="group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200"
                              role="button"
                              onClick={[addLocationFromSuggestion, result]}
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
                            </li>
                          )}
                        </For>
                      </ul>
                    )}
                  </Show>
                </>
              }
            >
              {(label) => (
                <>
                  <ListHeading>{label}</ListHeading>
                  <div class="my-2 flex flex-row gap-2 px-2">
                    <select
                      class="block shrink rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      onChange={(e) => onSelectRange(e.target.value)}
                      value={filters().range ?? defaultRange}
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
                      onClick={onClearLocation}
                    >
                      Clear Location
                    </button>
                  </div>
                </>
              )}
            </Show>
          </li>
          <Show when={(orgSuggestions()?.length ?? 0) > 0}>
            <li>
              <ListHeading>Associated Organizations</ListHeading>
              <ul class="text-sm text-gray-700">
                <For each={orgSuggestions() ?? []}>
                  {(suggestion) => (
                    <li
                      class="group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200"
                      role="button"
                      onClick={[addOrgFromSuggestion, suggestion]}
                    >
                      <div
                        class={cn(
                          'ml-2 size-2 rounded-full',
                          getMenuColorClass('INDIGO'),
                        )}
                        role="presentation"
                      />
                      <span class="flex-auto truncate pl-2">
                        {suggestion.organization.name}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </li>
          </Show>
          <For
            each={
              filteredTags().length > 0 ? filteredTags() : tagOptionByCategory()
            }
            fallback={<dt>Loading</dt>}
          >
            {(group) => (
              <Show when={group.tags.length > 0}>
                <li>
                  <ListHeading>
                    {getOrgTagCategoryLabel(group.category)}
                  </ListHeading>
                  <ul class="text-sm text-gray-700">
                    <For each={group.tags}>
                      {(tag) => (
                        <li
                          class="group flex cursor-pointer select-none items-center py-2 hover:bg-gray-200 focus:bg-gray-200"
                          role="button"
                          onClick={[addTag, tag]}
                        >
                          <div
                            class={cn(
                              'ml-2 size-2 rounded-full',
                              getMenuColorClass(tag.color),
                            )}
                            role="presentation"
                          />
                          <span class="flex-auto truncate pl-2">
                            {tag.label}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </li>
              </Show>
            )}
          </For>
        </ul>
      </FloatingDiv>
    </div>
  );
}
