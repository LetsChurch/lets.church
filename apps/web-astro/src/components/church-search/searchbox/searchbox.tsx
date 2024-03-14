import { For, createEffect, createMemo, createSignal } from 'solid-js';
import { useFloating } from 'solid-floating-ui';
import { size, shift } from '@floating-ui/dom';
import { throttle } from '@solid-primitives/scheduled';
import type { OrgTagQueryNode } from '../../../queries/churches';
import FloatingDiv from '../../floating-div';
import {
  pushArrayQueryParam,
  pushQueryParams,
  query,
  removeArrayQueryParam,
} from '../../../util/history';
import Chiclet from './chiclet';
import { LocationMenu, locationState, parsedLocation } from './location';
import {
  OrganizationMenu,
  organizationState,
  parsedOrganization,
} from './organization';
import { TagsMenu, parsedTags, tagsState } from './tags';

export const parsedFilters = createMemo(() => {
  return {
    ...parsedLocation(),
    ...parsedOrganization(),
    ...parsedTags(),
  };
});

export type Filters = ReturnType<typeof parsedFilters>;

export default function Searchbox() {
  let inputEl: HTMLInputElement;

  function clearInput() {
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
  }

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
  } = locationState(clearInput);
  const {
    organizationChiclet,
    setOrganizationLabel,
    organizationSuggestions,
    fetchOrganizationSuggestions,
    addOrganizationFromSuggestion,
    clearOrganizationSuggestions,
  } = organizationState(clearInput);
  const { tagChiclets, filteredTags, filterTags, tagOptionByCategory } =
    tagsState();

  const chiclets = createMemo(() => {
    return [...locationChiclet(), ...organizationChiclet(), ...tagChiclets()];
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

  // eslint-disable-next-line solid/reactivity
  const throttledRemoteSearch = throttle(async (text: string) => {
    if (!text) {
      clearLocationSuggestions();
      clearOrganizationSuggestions();
    }

    await Promise.all([
      fetchLocationSuggestions(text),
      fetchOrganizationSuggestions(text),
    ]);
  }, 200);

  createEffect(() => {
    const text = inputText();
    filterTags(text);
    throttledRemoteSearch(text);
  });

  function addTag(tag: OrgTagQueryNode) {
    pushArrayQueryParam('tag', tag.slug);
    clearInput();
  }

  function onClearLocation() {
    pushQueryParams({ range: null, center: null });
    setLocationLabel(null);
  }

  function onClearOrganization() {
    pushQueryParams({ organization: null });
    setOrganizationLabel(null);
  }

  function removeChiclet(chiclet: Pick<OrgTagQueryNode, 'slug'>) {
    if (chiclet.slug === 'location') {
      onClearLocation();
    } else if (chiclet.slug === 'organization') {
      onClearOrganization();
    } else {
      removeArrayQueryParam('tag', chiclet.slug);
    }
  }

  return (
    <div
      ref={setReference}
      class="flex cursor-text flex-wrap gap-2 rounded-md px-3 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600"
      onClick={() => {
        inputEl?.focus();
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
              onClearOrganization();
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
          <LocationMenu
            locationLabel={locationLabel()}
            locationSuggestions={locationSuggestions()}
            addLocationFromSuggestion={addLocationFromSuggestion}
            onClearLocation={onClearLocation}
          />
          <OrganizationMenu
            organizationSuggestions={organizationSuggestions()}
            addOrganizationFromSuggestion={addOrganizationFromSuggestion}
          />
          <TagsMenu
            tagOptionsByCategory={tagOptionByCategory()}
            filteredTags={filteredTags()}
            addTag={addTag}
          />
        </ul>
      </FloatingDiv>
    </div>
  );
}
