import {
  For,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js';
import { useFloating } from 'solid-floating-ui';
import { size, shift } from '@floating-ui/dom';
import { throttle } from '@solid-primitives/scheduled';
import { useLocation, useSearchParams } from '@solidjs/router';
import FloatingDiv from '../../floating-div';
import Chiclet from './chiclet';
import {
  LocationMenu,
  locationSlug,
  locationState,
  useParsedLocation,
} from './location';
import {
  OrganizationMenu,
  organizationSlug,
  organizationState,
  useParsedOrganization,
} from './organization';
import { TagsMenu, useParsedTags, tagSlug, tagsState } from './tags';
import { optionId } from './util';
import { OrganizationTag } from '~/__generated__/graphql-types';

export const useParsedFilters = () => {
  const parsedLocation = useParsedLocation();
  const parsedOrganization = useParsedOrganization();
  const parsedTags = useParsedTags();

  const filters = createMemo(() => ({
    ...parsedLocation(),
    ...parsedOrganization(),
    ...parsedTags(),
  }));

  return filters;
};

export type Filters = ReturnType<ReturnType<typeof useParsedFilters>>;

export default function Searchbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

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
  const { tagChiclets, filterTags, tagOptionsByCategory } = tagsState();

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
    location.search;
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

  function onClearLocation() {
    setSearchParams({ range: null, center: null });
    setLocationLabel(null);
  }

  function onClearOrganization() {
    setSearchParams({ organization: null });
    setOrganizationLabel(null);
  }

  function removeChiclet(chiclet?: Pick<OrganizationTag, 'slug'>) {
    if (!chiclet) {
      return;
    }

    if (chiclet.slug === locationSlug) {
      onClearLocation();
    } else if (chiclet.slug === organizationSlug) {
      onClearOrganization();
    } else {
      const newTags = searchParams[tagSlug]
        ?.split(',')
        .filter((t) => t !== chiclet.slug);
      setSearchParams({
        tag: (newTags?.length ?? 0) > 0 ? newTags?.join(',') : null,
      });
    }
  }

  const popupId = createUniqueId();

  const allOptionIds = createMemo(() => [
    ...(locationSuggestions()?.map((_, i) =>
      optionId(popupId, locationSlug, i),
    ) ?? []),
    ...(organizationSuggestions()?.map((_, i) =>
      optionId(popupId, organizationSlug, i),
    ) ?? []),
    ...(tagOptionsByCategory()
      ?.filter((group) => group.tags.length > 0)
      .flatMap((group, groupIndex) =>
        group.tags.map((_, tagIndex) =>
          optionId(popupId, `${tagSlug}:${groupIndex}`, tagIndex),
        ),
      ) ?? []),
  ]);

  const [activeOptionIndex, setActiveOptionIndex] = createSignal(-1);
  const [arrowPressed, setArrowPressed] = createSignal(false);
  const activeOptionId = createMemo(() =>
    arrowPressed() ? allOptionIds()[activeOptionIndex()] : null,
  );

  createEffect(() => {
    if (allOptionIds().length > 0 && arrowPressed()) {
      setActiveOptionIndex(0);
    } else {
      setActiveOptionIndex(-1);
      setArrowPressed(false);
    }
  });

  function handleKeyDown(
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (e.key === 'Enter') {
      const activeId = activeOptionId();
      if (activeId) {
        document.getElementById(activeId)?.click();
        e.currentTarget.value = '';
        setActiveOptionIndex(-1);
        setArrowPressed(false);
      }
    }

    if (e.key === 'ArrowDown' && allOptionIds().length > 0) {
      e.preventDefault();
      setActiveOptionIndex((i) => (i + 1) % allOptionIds().length);
      setArrowPressed(true);
      return;
    }

    if (e.key === 'ArrowUp' && allOptionIds().length > 0) {
      e.preventDefault();
      setActiveOptionIndex(
        (i) => (i - 1 + allOptionIds().length) % allOptionIds().length,
      );
      setArrowPressed(true);
      return;
    }

    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      const slug = chiclets().at(-1)?.slug;

      if (slug === 'location') {
        onClearLocation();
      } else if (slug === 'organization') {
        onClearOrganization();
      } else if (slug) {
        const newTags = searchParams[tagSlug]
          ?.split(',')
          .filter((t) => t !== slug);
        setSearchParams({
          tag: (newTags?.length ?? 0) > 0 ? newTags?.join(',') : null,
        });
      }
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
            color={chiclet?.color ?? 'GRAY'}
            class="shrink-0 grow-0 basis-0 whitespace-nowrap"
            onRemove={() => removeChiclet(chiclet)}
          >
            {chiclet?.label ?? 'Unknown'}
          </Chiclet>
        )}
      </For>
      <input
        ref={inputEl!}
        class="w-0 min-w-16 shrink grow rounded-md border-0 p-0 text-gray-900 focus:ring-0 sm:text-sm sm:leading-6"
        role="combobox"
        aria-controls={popupId}
        aria-expanded={floatOpen()}
        aria-activeDescendant={activeOptionId()}
        placeholder={chiclets().length === 0 ? 'Search' : ''}
        onKeyDown={handleKeyDown}
        onInput={(e) => {
          setInputText(e.currentTarget.value);
          setFloatOpen(true);
          float()?.scrollTo(0, 0);
        }}
      />
      <FloatingDiv
        ref={setFloat}
        open={floatOpen()}
        onClose={() => setFloatOpen(false)}
        position={floatPosition}
        id={popupId}
        class="relative max-h-64 overflow-y-auto"
        role="listbox"
      >
        <ul>
          <LocationMenu
            locationLabel={locationLabel()}
            locationSuggestions={locationSuggestions()}
            addLocationFromSuggestion={addLocationFromSuggestion}
            onClearLocation={onClearLocation}
            optionPrefix={popupId}
            activeOptionId={activeOptionId()}
          />
          <OrganizationMenu
            organizationSuggestions={organizationSuggestions()}
            addOrganizationFromSuggestion={addOrganizationFromSuggestion}
            optionPrefix={popupId}
            activeOptionId={activeOptionId()}
          />
          <TagsMenu
            tagOptionsByCategory={tagOptionsByCategory()}
            clearInput={clearInput}
            optionPrefix={popupId}
            activeOptionId={activeOptionId()}
          />
        </ul>
      </FloatingDiv>
    </div>
  );
}
