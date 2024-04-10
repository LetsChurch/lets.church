import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { gql } from 'graphql-request';
import { Optional, cn } from '../../../util';
import ListHeading from './list-heading';
import { getMenuColorClass, getOrgTagCategoryLabel, optionId } from './util';
import ResultRow from './result-row';
import {
  OrganizationTagsQuery,
  OrganizationTagsQueryVariables,
} from './__generated__/tags';
import { OrganizationTag } from '~/__generated__/graphql-types';
import { getAuthenticatedClient } from '~/util/gql/server';

export const tagSlug = 'tag';

export const useParsedTags = () => {
  const [searchParams] = useSearchParams();

  const parsed = createMemo(() => ({
    tags: searchParams['tag']?.split(',') ?? [],
  }));

  return parsed;
};

async function fetchOrganizationTags() {
  'use server';
  const client = await getAuthenticatedClient();

  const res = await client.request<
    OrganizationTagsQuery,
    OrganizationTagsQueryVariables
  >(gql`
    query OrganizationTags {
      organizationTagsConnection(first: 1024) {
        edges {
          node {
            category
            slug
            label
            color
          }
        }
      }
    }
  `);

  return res;
}

export type OrganizationTagQueryNode = Awaited<
  ReturnType<typeof fetchOrganizationTags>
>['organizationTagsConnection']['edges'][number]['node'];

type TagsGroup = {
  category: OrganizationTag['category'];
  tags: Array<OrganizationTagQueryNode>;
};

export function tagsState() {
  const [rawTagData, setRawTagData] = createSignal<
    Array<OrganizationTagQueryNode>
  >([]);
  const [tagOptionsByCategory, setTagOptionsByCategory] =
    createSignal<null | Array<TagsGroup>>(null);
  const [filterText, setFilterText] = createSignal('');

  onMount(async () => {
    const data = await fetchOrganizationTags();
    setRawTagData(
      data.organizationTagsConnection.edges.map((edge) => edge.node),
    );

    const grouped = Object.groupBy(rawTagData(), (node) => node.category);
    const groups = Object.keys(grouped)
      .sort()
      .map((category) => ({
        category: category as OrganizationTagQueryNode['category'],
        tags: grouped[category as OrganizationTagQueryNode['category']] ?? [],
      }));
    setTagOptionsByCategory(groups);
  });

  const parsedTags = useParsedTags();

  const tagChiclets = createMemo(() => {
    return parsedTags()
      .tags.map((slug) => rawTagData().find((t) => t.slug === slug))
      .filter(Boolean)
      .sort((a, b) => (a?.label.length ?? 0) - (b?.label.length ?? 0));
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
          .filter((t) => !chics.some((c) => c?.slug === t.slug)),
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
  activeOptionId?: Optional<string>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  function addTag(tag: OrganizationTagQueryNode) {
    const tags = searchParams[tagSlug]?.split(',') ?? [];
    tags.push(tag.slug);
    setSearchParams({ [tagSlug]: tags.join(',') });
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
                    onClick={() => addTag(tag)}
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
