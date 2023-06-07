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
import { A, RouteDataArgs, useLocation, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import '@fontsource/roboto-mono/variable.css';
import { Dynamic } from 'solid-js/web';
import ChevronDownIcon from '@tabler/icons/chevron-down.svg?component-solid';
import FilterIcon from '@tabler/icons/filter.svg?component-solid';
import { useFloating } from 'solid-floating-ui';
import humanFormat from 'human-format';
import pluralize from 'pluralize';
import type { SearchQuery, SearchQueryVariables } from './__generated__/search';
import Pagination from '~/components/pagination';
import Thumbnail, {
  type Props as ThumbnailProps,
} from '~/components/thumbnail';
import { client, gql } from '~/util/gql/server';
import { SearchFocus } from '~/__generated__/graphql-types';
import { formatTime, Optional } from '~/util';
import FloatingDiv from '~/components/floating-div';
import NavigatingBooleans from '~/components/navigating-booleans';
import NavigatingChecklist from '~/components/navigating-checklist';
import NavigatingDateRange from '~/components/navigating-date-range';
import OffCanvasDiv from '~/components/off-canvas-div';
import { Avatar } from '~/components/avatar';
import { formatDateFull } from '~/util/date';

const PAGE_SIZE = 12;

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([
      ,
      q = '',
      focus = 'uploads',
      after = null,
      before = null,
      publishedAtRange = null,
      channels = null,
      transcriptPhraseSearch = 'true',
    ]) => {
      const [minPublishedAt = null, maxPublishedAt = null] =
        publishedAtRange?.split('/') ?? [];

      return client.request<SearchQuery, SearchQueryVariables>(
        gql`
          fragment SearchUploadRecordProps on UploadRecord {
            title
            publishedAt
            totalViews
            thumbnailBlurhash
            thumbnailUrl
            variants
            channel {
              id
              slug
              name
              avatarUrl
            }
          }

          query Search(
            $query: String!
            $focus: SearchFocus!
            $first: Int
            $after: String
            $last: Int
            $before: String
            $minPublishedAt: DateTime
            $maxPublishedAt: DateTime
            $channels: [ShortUuid!]
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
                    id
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
                      ...SearchUploadRecordProps
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
                      ...SearchUploadRecordProps
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
          channels,
          transcriptPhraseSearch: transcriptPhraseSearch === 'true',
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
          location.query['channels']?.split(',').filter(Boolean),
          location.query['transcriptPhraseSearch'],
        ] as const,
    },
  );
}

type SearchHitRowProps = Omit<ThumbnailProps, 'width' | 'height' | 'url'> &
  ParentProps<{
    href: string;
    thumbnailUrl?: Optional<string>;
    title: string;
    totalViews: number;
    publishedAt: string;
    channelName: string;
    channelSlug: string;
    channelAvatarUrl?: Optional<string>;
    marked?: boolean;
    class?: string | undefined;
  }>;

function SearchHitRow(props: SearchHitRowProps) {
  return (
    <div
      class={`relative grid grid-cols-1 gap-5 md:grid-cols-[352px_auto] md:grid-rows-1 md:flex-row ${
        props.class ?? ''
      }`}
    >
      <Thumbnail
        url={props.thumbnailUrl}
        blurhash={props.blurhash}
        width={352}
        height={198}
        placeholder={props.placeholder}
      />
      <div class="space-y-2">
        <h3 class="text-2xl font-semibold">
          <A href={props.href} class="before:absolute before:inset-0">
            {props.title}
          </A>
        </h3>
        <p class="text-xs text-gray-500">
          {' '}
          {humanFormat(props.totalViews ?? 0)}{' '}
          {pluralize('view', props.totalViews ?? 0)} &middot;{' '}
          <time datetime={props.publishedAt} class="text-gray-600">
            {formatDateFull(new Date(props.publishedAt))}
          </time>
        </p>
        <A
          href={`/channel/${props.channelSlug}`}
          class="relative z-10 inline-flex items-center space-x-2"
        >
          <Avatar
            size="sm"
            src={props.channelAvatarUrl}
            alt={props.channelName}
          />
          <span class="text-sm text-gray-500">{props.channelName}</span>
        </A>
        {props.children}
      </div>
    </div>
  );
}

function SearchTranscriptHitRow(
  props: Omit<SearchHitRowProps, 'children'> & {
    innerHits: Array<{ start: number; end: number; text: { marked: string } }>;
  },
) {
  const [local, rest] = splitProps(props, ['innerHits']);
  const [showMore, setShowMore] = createSignal(false);

  return (
    <SearchHitRow {...rest} class={showMore() ? undefined : 'group'}>
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
              <dt class="w-10 items-center font-mono text-sm font-medium uppercase text-gray-400 group-hover/t-row:text-gray-600">
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
    </SearchHitRow>
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
          : `?${new URLSearchParams({
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
      value: channel.id,
      checked: channelsValues().includes(channel.id),
    })) ?? [];
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
                <SearchHitRow
                  href={`/media/${node.id}`}
                  thumbnailUrl={node.uploadRecord.thumbnailUrl}
                  blurhash={node.uploadRecord.thumbnailBlurhash}
                  title={node.title}
                  totalViews={node.uploadRecord.totalViews}
                  publishedAt={node.uploadRecord.publishedAt ?? ''}
                  channelName={node.uploadRecord.channel.name}
                  channelSlug={node.uploadRecord.channel.slug}
                  channelAvatarUrl={node.uploadRecord.channel.avatarUrl}
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
                  thumbnailUrl={node.uploadRecord.thumbnailUrl}
                  blurhash={node.uploadRecord.thumbnailBlurhash}
                  title={node.uploadRecord.title ?? 'Untitled'}
                  totalViews={node.uploadRecord.totalViews}
                  publishedAt={node.uploadRecord.publishedAt ?? ''}
                  channelName={node.uploadRecord.channel.name}
                  channelSlug={node.uploadRecord.channel.slug}
                  channelAvatarUrl={node.uploadRecord.channel.avatarUrl}
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
        label={
          <>
            Showing{' '}
            <span class="font-medium">{data()?.search.edges.length}</span> of{' '}
            <span class="font-medium">
              <Switch fallback={data()?.search.aggs.uploadHitCount}>
                <Match when={loc.query['focus'] === 'transcripts'}>
                  {data()?.search.aggs.transcriptHitCount}
                </Match>
              </Switch>
            </span>{' '}
            results
          </>
        }
      />
    </div>
  );
}
