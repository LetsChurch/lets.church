import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { pushArrayQueryParam, query } from '../../../util/history';
import type {
  OrgTagQueryNode,
  organizationTagsQuery,
} from '../../../queries/churches';
import type { ResultOf } from '../../../util/graphql';
import { cn } from '../../../util';
import ListHeading from './list-heading';
import { getMenuColorClass, getOrgTagCategoryLabel, optionId } from './util';
import ResultRow from './result-row';

export const tagSlug = 'tag';

export const parsedTags = createMemo(() => {
  const q = query();

  return {
    tags: q.getAll('tag'),
  };
});

type TagsGroup = {
  category: OrgTagQueryNode['category'];
  tags: Array<OrgTagQueryNode>;
};

export function tagsState() {
  const [rawTagData, setRawTagData] = createSignal<Array<OrgTagQueryNode>>([]);
  const [tagOptionsByCategory, setTagOptionsByCategory] =
    createSignal<null | Array<TagsGroup>>(null);
  // const [filteredTags, setFilteredTags] = createSignal<null | Array<TagsGroup>>(
  //   null,
  // );
  const [filterText, setFilterText] = createSignal('');

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

  const tagChiclets = createMemo(() => {
    return parsedTags()
      .tags.map((slug) => rawTagData().find((t) => t.slug === slug))
      .filter(Boolean)
      .sort((a, b) => a.label.length - b.label.length);
  });

  const filteredTags = createMemo(() => {
    const needle = filterText().toLocaleLowerCase();
    const chics = tagChiclets();

    if (!needle && chics.length === 0) {
      return [];
    }

    return (
      tagOptionsByCategory()?.map((group) => ({
        ...group,
        tags: group.tags
          .filter((t) => t.label.includes(needle) || t.slug.includes(needle))
          .filter((t) => !chics.some((c) => c.slug === t.slug)),
      })) ?? null
    );
  });

  const renderedOptions = createMemo(() => {
    return (filteredTags()?.length ?? 0) > 0
      ? filteredTags()
      : tagOptionsByCategory();
  });

  return {
    tagChiclets,
    filterTags: setFilterText,
    tagOptionsByCategory: renderedOptions,
  };
}

export function TagsMenu(props: {
  tagOptionsByCategory: Array<TagsGroup> | null;
  clearInput: () => unknown;
  optionPrefix: string;
  activeOptionId: string | null;
}) {
  function addTag(tag: OrgTagQueryNode) {
    pushArrayQueryParam(tagSlug, tag.slug);
    props.clearInput();
  }

  return (
    <For each={props.tagOptionsByCategory} fallback={<dt>Loading</dt>}>
      {(group, groupIndex) => (
        <Show when={group.tags.length > 0}>
          <li>
            <ListHeading>{getOrgTagCategoryLabel(group.category)}</ListHeading>
            <ul class="text-sm text-gray-700">
              <For each={group.tags}>
                {(tag, tagIndex) => (
                  <ResultRow
                    id={optionId(
                      props.optionPrefix,
                      `${tagSlug}:${groupIndex()}`,
                      tagIndex(),
                    )}
                    activeId={props.activeOptionId}
                    onClick={[addTag, tag]}
                  >
                    <div
                      class={cn(
                        'ml-2 size-2 rounded-full',
                        getMenuColorClass(tag.color),
                      )}
                      role="presentation"
                    />
                    <span class="flex-auto truncate pl-2">{tag.label}</span>
                  </ResultRow>
                )}
              </For>
            </ul>
          </li>
        </Show>
      )}
    </For>
  );
}
