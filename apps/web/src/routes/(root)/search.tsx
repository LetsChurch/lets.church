import {
  For,
  Match,
  type ParentProps,
  Switch,
  splitProps,
  createSignal,
  Show,
  createUniqueId,
} from 'solid-js';
import { A, type RouteDataArgs, useLocation, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import '@fontsource/roboto-mono/variable.css';
import { Dynamic } from 'solid-js/web';
import ChevronDownIcon from '@tabler/icons/chevron-down.svg?component-solid';
import FilterIcon from '@tabler/icons/filter.svg?component-solid';
import { useFloating } from 'solid-floating-ui';
import { gql } from 'graphql-request';
import type { SearchQuery, SearchQueryVariables } from './__generated__/search';
import Pagination from '~/components/pagination';
import { client } from '~/util/gql/server';
import { SearchFocus, SearchOrder } from '~/__generated__/graphql-types';
import { formatTime } from '~/util';
import FloatingDiv from '~/components/floating-div';
import NavigatingBooleans from '~/components/navigating-booleans';
import NavigatingChecklist from '~/components/navigating-checklist';
import NavigatingDateRange from '~/components/navigating-date-range';
import OffCanvasDiv from '~/components/off-canvas-div';
import { setQueryParams } from '~/util/url';
import {
  MediaRow,
  MediaRowFragment,
  type Props as MediaRowProps,
} from '~/components/media-row';

const PAGE_SIZE = 20;

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([
      ,
      q = '',
      focus = 'uploads',
      after = null,
      before = null,
      publishedAtRange = null,
      orderBy,
      channels = null,
      transcriptPhraseSearch,
    ]) => {
      const [minPublishedAt = null, maxPublishedAt = null] =
        publishedAtRange?.split('/') ?? [];

      return client.request<SearchQuery, SearchQueryVariables>(
        gql`
          ${MediaRowFragment}

          query Search(
            $query: String!
            $focus: SearchFocus!
            $first: Int
            $after: String
            $last: Int
            $before: String
            $minPublishedAt: DateTime
            $maxPublishedAt: DateTime
            $orderBy: SearchOrder
            $channels: [String!]
            $transcriptPhraseSearch: Boolean
          ) {
            search(
              focus: $focus
              query: $query
              first: $first
              after: $after
              last: $last
              before: $before
              minPublishedAt: $minPublishedAt
              maxPublishedAt: $maxPublishedAt
              orderBy: $orderBy
              channels: $channels
              transcriptPhraseSearch: $transcriptPhraseSearch
            ) {
              aggs {
                uploadHitCount
                channelHitCount
                organizationHitCount
                transcriptHitCount
                channels {
                  count
                  channel {
                    slug
                    name
                  }
                }
                publishedAtRange {
                  min
                  max
                }
              }
              pageInfo {
                endCursor
                hasNextPage
                hasPreviousPage
                startCursor
              }
              edges {
                cursor
                node {
                  __typename
                  id
                  ... on UploadSearchHit {
                    title
                    uploadRecord {
                      ...MediaRowProps
                    }
                  }
                  ... on TranscriptSearchHit {
                    id
                    hits {
                      start
                      end
                      text {
                        marked
                      }
                    }
                    uploadRecord {
                      ...MediaRowProps
                    }
                  }
                }
              }
            }
          }
        `,
        {
          query: q,
          focus:
            focus === 'uploads'
              ? SearchFocus.Uploads
              : focus === 'transcripts'
              ? SearchFocus.Transcripts
              : SearchFocus.Uploads,
          after,
          before,
          first: after || !before ? PAGE_SIZE : null,
          last: before ? PAGE_SIZE : null,
          minPublishedAt: minPublishedAt
            ? new Date(minPublishedAt).toISOString()
            : null,
          maxPublishedAt: maxPublishedAt
            ? new Date(maxPublishedAt).toISOString()
            : null,
          orderBy:
            orderBy === 'avg'
              ? SearchOrder.Avg
              : orderBy === 'sum'
              ? SearchOrder.Sum
              : orderBy === 'date'
              ? SearchOrder.Date
              : orderBy === 'dateDesc'
              ? SearchOrder.DateDesc
              : null,
          channels,
          transcriptPhraseSearch,
        },
      );
    },
    {
      key: () =>
        [
          'search',
          location.query['q'],
          location.query['focus'],
          location.query['after'],
          location.query['before'],
          location.query['publishedAt'],
          location.query['orderBy'],
          location.query['channels']?.split(',').filter(Boolean),
          (location.query['transcriptPhraseSearch'] ?? 'true') === 'true',
        ] as const,
    },
  );
}

function SearchTranscriptHitRow(
  props: Omit<MediaRowProps, 'children'> & {
    innerHits: Array<{ start: number; end: number; text: { marked: string } }>;
  },
) {
  const [local, rest] = splitProps(props, ['innerHits']);
  const [showMore, setShowMore] = createSignal(false);

  return (
    <MediaRow {...rest} class={showMore() ? undefined : 'group'}>
      <dl class="rounded-md bg-gray-50 p-3">
        <For
          each={local.innerHits
            .slice(0, showMore() ? undefined : 1)
            .sort((a, b) => a.start - b.start)}
        >
          {(hit) => (
            <A
              href={`${props.href}#t=${hit.start / 1000}`}
              class="group/t-row relative z-10 flex gap-2 rounded-md px-2 py-1 hover:cursor-pointer"
              classList={{
                group: showMore(),
                'bg-indigo-50': showMore() && hit === local.innerHits[0],
              }}
            >
              <dt class="items-center font-mono text-sm font-medium uppercase text-gray-400 group-hover/t-row:text-gray-600">
                {formatTime(hit.start)}
              </dt>
              <dd
                class="[&_mark]:in-expo [&_mark]:out-expo text-sm [&_mark]:bg-transparent [&_mark]:transition-colors [&_mark]:duration-200 group-hover:[&_mark]:bg-yellow-200"
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={hit.text.marked ?? ''}
              />
            </A>
          )}
        </For>
      </dl>
      <Show when={local.innerHits.length > 1}>
        <button
          onClick={() => setShowMore((sm) => !sm)}
          class="relative z-10 text-xs font-medium uppercase text-gray-400 hover:text-gray-600"
        >
          Show {local.innerHits.length - 1} {showMore() ? 'Less' : 'More'}
        </button>
      </Show>
    </MediaRow>
  );
}

type AggFilterProps = ParentProps<{
  title: string;
  count?: number;
  q?: string;
  focus?: string;
  disabled?: boolean;
  active?: boolean;
}>;

function AggFilter(props: AggFilterProps) {
  const loc = useLocation();
  const current = () =>
    props.active ??
    (loc.query['focus'] === props.focus ||
      (!loc.query['focus'] && props.focus === 'uploads'));
  const [showMenu, setShowMenu] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'bottom-end',
  });
  const menuButtonId = createUniqueId();

  const isMenu = () => Boolean(props.children);

  return (
    <Dynamic
      component={isMenu() ? 'button' : A}
      ref={setReference}
      id={menuButtonId}
      disabled={props.disabled === true}
      onClick={() => setShowMenu(true)}
      href={
        isMenu()
          ? undefined
          : `?${setQueryParams(loc.search, {
              q: props.q ?? '',
              focus: props.focus ?? '',
            })}`
      }
      class={`flex items-center whitespace-nowrap border-b-2 border-transparent px-1 py-4 text-sm font-medium ${
        current() ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {props.title}
      <Show when={!isMenu() || (props.count ?? 0) > 0}>
        <span
          class={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium md:inline-block ${
            current()
              ? 'bg-indigo-100 text-indigo-600'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          {props.count}
        </span>
      </Show>
      <Show when={isMenu()}>
        <ChevronDownIcon class="scale-75" />
      </Show>
      <Show when={props.children}>
        <FloatingDiv
          ref={setFloating}
          open={showMenu()}
          position={position}
          aria-labelledby={menuButtonId}
          onClose={() => setShowMenu(false)}
          class="-mt-2"
        >
          {props.children}
        </FloatingDiv>
      </Show>
    </Dynamic>
  );
}

function toDateOrNull(date?: string) {
  if (date) {
    return new Date(date);
  }

  return null;
}

export default function SearchRoute() {
  const [showFiltersMenu, setShowFiltersMenu] = createSignal(false);
  const data = useRouteData<typeof routeData>();
  const loc = useLocation();
  const channelsCount = () =>
    new URLSearchParams(loc.search).get('channels')?.split(',').length ?? 0;
  const channelsValues = () =>
    loc.query['channels']?.split(',').filter(Boolean) ?? [];
  const channelsOptions = () =>
    data()?.search.aggs.channels.map(({ channel }) => ({
      label: channel.name,
      value: channel.slug,
      checked: channelsValues().includes(channel.slug),
    })) ?? [];
  const orderByOptions = () => [
    { label: 'Default', value: '', checked: loc.query['orderBy'] === 'avg' },
    ...(loc.query['focus'] === 'transcripts'
      ? [
          {
            label: 'Hits',
            value: 'sum',
            checked: loc.query['orderBy'] === 'sum',
          },
        ]
      : []),
    {
      label: 'Date ↑',
      value: 'date',
      checked: loc.query['orderBy'] === 'date',
    },
    {
      label: 'Date ↓',
      value: 'dateDesc',
      checked: loc.query['orderBy'] === 'dateDesc',
    },
  ];
  const transcriptPhraseSearch = () =>
    (loc.query['transcriptPhraseSearch'] ?? 'true') === 'true';

  return (
    <div class="space-y-5">
      <div class="flex justify-between">
        <nav class="flex space-x-5" aria-label="Search Focus">
          <For
            each={[
              {
                title: 'Media',
                focus: 'uploads',
                count: data()?.search.aggs.uploadHitCount ?? 0,
              },
              {
                title: 'Transcripts',
                focus: 'transcripts',
                count: data()?.search.aggs.transcriptHitCount ?? 0,
              },
            ]}
          >
            {({ title, focus, count }) => (
              <AggFilter
                q={loc.query['q'] ?? ''}
                focus={focus}
                title={title}
                count={count}
              />
            )}
          </For>
        </nav>
        <button
          class="text-gray-500 hover:text-gray-700 sm:hidden"
          aria-label="Filters"
          onClick={() => setShowFiltersMenu(true)}
        >
          <FilterIcon />
        </button>
        <OffCanvasDiv
          open={showFiltersMenu()}
          onClose={() => setShowFiltersMenu(false)}
          title="Filters"
          class="sm:hidden"
          backdropClass="sm:hidden"
        >
          <div class="space-y-2">
            <h3 class="font-medium text-gray-900">Channels</h3>
            <NavigatingChecklist
              options={channelsOptions()}
              queryKey="channels"
            />
          </div>
          <div class="space-y-2">
            <h3 class="font-medium text-gray-900">Published Date</h3>
            <NavigatingDateRange
              queryKey="publishedAt"
              min={toDateOrNull(data()?.search.aggs.publishedAtRange?.min)}
              max={toDateOrNull(data()?.search.aggs.publishedAtRange?.max)}
            />
          </div>
          <div>
            <h3 class="space-y-2">Sort</h3>
            <NavigatingChecklist
              radios
              options={orderByOptions()}
              queryKey="orderBy"
            />
          </div>
          <div>
            <h3 class="space-y-2">Advanced</h3>
            <NavigatingBooleans
              options={[
                {
                  label: 'Search Phrases',
                  queryKey: 'transcriptPhraseSearch',
                  checked: transcriptPhraseSearch(),
                },
              ]}
              class="px-2"
            />
          </div>
        </OffCanvasDiv>
        <nav class="hidden space-x-5 sm:flex" aria-label="Search Filters">
          <AggFilter title="Advanced">
            <NavigatingBooleans
              options={[
                {
                  label: 'Search Phrases',
                  queryKey: 'transcriptPhraseSearch',
                  checked: transcriptPhraseSearch(),
                },
              ]}
              class="px-2"
            />
          </AggFilter>
          <AggFilter
            title="Channels"
            count={channelsCount()}
            disabled={channelsOptions().length === 0}
          >
            <NavigatingChecklist
              options={channelsOptions()}
              queryKey="channels"
              class="px-2"
            />
          </AggFilter>
          <AggFilter title="Sort" active={Boolean(loc.query['orderBy'])}>
            <NavigatingChecklist
              radios
              options={orderByOptions()}
              queryKey="orderBy"
              class="px-2"
            />
          </AggFilter>
          <AggFilter
            title="Published Date"
            active={Boolean(loc.query['publishedAt'])}
          >
            <NavigatingDateRange
              queryKey="publishedAt"
              min={toDateOrNull(data()?.search.aggs.publishedAtRange?.min)}
              max={toDateOrNull(data()?.search.aggs.publishedAtRange?.max)}
              class="p-2"
            />
          </AggFilter>
        </nav>
      </div>
      <For each={data()?.search.edges}>
        {(edge) => (
          <Switch>
            <Match
              when={edge.node.__typename === 'UploadSearchHit' && edge.node}
              keyed
            >
              {(node) => (
                <MediaRow
                  href={`/media/${node.id}`}
                  uploadProps={node.uploadRecord}
                  placeholder={
                    node.uploadRecord.variants.some((v) =>
                      v.startsWith('VIDEO'),
                    )
                      ? 'video'
                      : node.uploadRecord.variants.some((v) =>
                          v.startsWith('AUDIO'),
                        )
                      ? 'audio'
                      : undefined
                  }
                />
              )}
            </Match>
            <Match
              when={edge.node.__typename === 'TranscriptSearchHit' && edge.node}
              keyed
            >
              {(node) => (
                <SearchTranscriptHitRow
                  href={`/media/${node.id}`}
                  uploadProps={node.uploadRecord}
                  placeholder={
                    node.uploadRecord.variants.some((v) =>
                      v.startsWith('VIDEO'),
                    )
                      ? 'video'
                      : node.uploadRecord.variants.some((v) =>
                          v.startsWith('AUDIO'),
                        )
                      ? 'audio'
                      : undefined
                  }
                  innerHits={node.hits}
                />
              )}
            </Match>
          </Switch>
        )}
      </For>
      <Pagination
        hasPreviousPage={data()?.search.pageInfo.hasPreviousPage ?? false}
        hasNextPage={data()?.search.pageInfo.hasNextPage ?? false}
        startCursor={data()?.search.pageInfo.startCursor ?? ''}
        endCursor={data()?.search.pageInfo.endCursor ?? ''}
      />
    </div>
  );
}
