import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from 'solid-js';
import type { ResultOf } from 'gql.tada';
import { useFloating } from 'solid-floating-ui';
import { size, shift } from '@floating-ui/dom';
import { throttle } from '@solid-primitives/scheduled';
import { array, object, parse, string, type Input } from 'valibot';
import type {
  OrgTagQueryNode,
  organizationTagsQuery,
} from '../../../queries/churches';
import FloatingDiv from '../../floating-div';
import { cn } from '../../../util';
import {
  pushArrayQueryParam,
  pushQueryParams,
  query,
  removeArrayQueryParam,
} from '../../../util/history';
import Chiclet from './chiclet';
import { LocationMenuItem, locationState, locationFilters } from './location';
import ListHeading from './list-heading';
import { getMenuColorClass, getOrgTagCategoryLabel } from './util';

const fetchOrgSchema = object({ name: string() });

async function fetchOrg(id: string) {
  const res = await fetch(`/organizations?${new URLSearchParams({ id })}`, {
    headers: { accept: 'application/json' },
  });

  return parse(fetchOrgSchema, await res.json());
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

const parsedLocationFilters = locationFilters();

export const parsedFilters = () => {
  const memo = createMemo(() => {
    const q = query();

    return {
      ...parsedLocationFilters(),
      organization: q.get('organization'),
      tags: q.getAll('tag'),
    };
  });

  return memo;
};

export type Filters = ReturnType<ReturnType<typeof parsedFilters>>;

export default function Searchbox() {
  const [inputEl, setInputEl] = createSignal<HTMLInputElement>();
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [float, setFloat] = createSignal<HTMLDivElement>();
  const [floatOpen, setFloatOpen] = createSignal(false);
  const {
    locationLabel,
    setLocationLabel,
    locationChiclet,
    locationSuggestions,
    fetchLocationSuggestions,
    addLocationFromSuggestion,
    clearLocationSuggestions,
    // eslint-disable-next-line solid/reactivity
  } = locationState(inputEl);
  const [orgLabel, setOrgLabel] = createSignal<string | null>(null);
  const [rawTagData, setRawTagData] = createSignal<Array<OrgTagQueryNode>>([]);
  const filters = parsedFilters();

  const chiclets = createMemo(() => {
    const filterChiclets = filters()
      .tags.map((slug) => rawTagData().find((t) => t.slug === slug))
      .filter(Boolean)
      .sort((a, b) => a.label.length - b.label.length);

    const orgLab = orgLabel();

    const orgChiclet = orgLab
      ? [{ color: 'INDIGO' as const, slug: 'organization', label: orgLab }]
      : [];

    return [...locationChiclet(), ...orgChiclet, ...filterChiclets];
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
    const orgId = q.get('organization');

    if (orgId) {
      const res = await fetchOrg(orgId);
      setOrgLabel(res.name);
    }
  });

  const [orgSuggestions, setOrgSuggestions] = createSignal<null | Input<
    typeof orgSuggestSchema
  >>(null);

  // eslint-disable-next-line solid/reactivity
  const throttledRemoteSearch = throttle(async (text: string) => {
    if (!text) {
      clearLocationSuggestions();
    }

    const [, orgsRes] = await Promise.all([
      fetchLocationSuggestions(text),
      orgLabel() ? null : getOrganizationSuggestions(text),
    ] as const);

    setOrgSuggestions(orgsRes);
  }, 200);

  createEffect(() => {
    throttledRemoteSearch(inputText());
  });

  async function addOrgFromSuggestion({
    organization,
  }: Input<typeof suggestedOrgSchema>) {
    pushQueryParams({
      org: organization.id,
    });
    setOrgSuggestions(null);
    setOrgLabel(organization.name);

    const el = inputEl();

    if (el) {
      el.value = '';
      el.focus();
    }
  }

  function addTag(tag: OrgTagQueryNode) {
    pushArrayQueryParam('tag', tag.slug);

    const el = inputEl();

    if (el) {
      el.value = '';
      el.focus();
    }
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
        inputEl()?.focus();
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
        ref={setInputEl}
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
            <LocationMenuItem
              locationLabel={locationLabel()}
              locationSuggestions={locationSuggestions()}
              addLocationFromSuggestion={addLocationFromSuggestion}
              onClearLocation={onClearLocation}
            />
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
