import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { query } from '../../../util/history';
import type {
  OrgTagQueryNode,
  organizationTagsQuery,
} from '../../../queries/churches';
import type { ResultOf } from '../../../util/graphql';
import { cn } from '../../../util';
import ListHeading from './list-heading';
import { getMenuColorClass, getOrgTagCategoryLabel } from './util';
import ResultRow from './result-row';

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
  const [tagOptionByCategory, setTagOptionsByCategory] =
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
      tagOptionByCategory()?.map((group) => ({
        ...group,
        tags: group.tags
          .filter((t) => t.label.includes(needle) || t.slug.includes(needle))
          .filter((t) => !chics.some((c) => c.slug === t.slug)),
      })) ?? null
    );
  });

  return {
    tagChiclets,
    filterTags: setFilterText,
    filteredTags,
    tagOptionByCategory,
  };
}

export function TagsMenu(props: {
  tagOptionsByCategory: Array<TagsGroup> | null;
  filteredTags: Array<TagsGroup> | null;
  addTag: (tag: OrgTagQueryNode) => unknown;
}) {
  return (
    <For
      each={
        (props.filteredTags?.length ?? 0) > 0
          ? props.filteredTags
          : props.tagOptionsByCategory
      }
      fallback={<dt>Loading</dt>}
    >
      {(group) => (
        <Show when={group.tags.length > 0}>
          <li>
            <ListHeading>{getOrgTagCategoryLabel(group.category)}</ListHeading>
            <ul class="text-sm text-gray-700">
              <For each={group.tags}>
                {(tag) => (
                  <ResultRow onClick={[props.addTag, tag]}>
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
