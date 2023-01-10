import prettyMs from 'pretty-ms';
import {
  For,
  Match,
  type ParentProps,
  Switch,
  splitProps,
  createSignal,
  Show,
} from 'solid-js';
import { A, RouteDataArgs, useLocation, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import Pagination from '~/components/pagination';
import Thumbnail, {
  type Props as ThumbnailProps,
} from '~/components/thumbnail';
import { client, gql } from '~/util/gql/server';
import { SearchFocus } from '~/__generated__/graphql-types';
import type { SearchQuery, SearchQueryVariables } from './__generated__/search';

const PAGE_SIZE = 12;

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([, q = '', focus = 'uploads', after = null, before = null]) => {
      return client.request<SearchQuery, SearchQueryVariables>(
        gql`
          fragment SearchUploadRecordProps on UploadRecord {
            title
            thumbnailBlurhash
            thumbnailUrl
            variants
            channel {
              id
              name
            }
          }

          query Search(
            $query: String!
            $focus: SearchFocus!
            $first: Int
            $after: String
            $last: Int
            $before: String
          ) {
            search(
              focus: $focus
              query: $query
              first: $first
              after: $after
              last: $last
              before: $before
            ) {
              aggs {
                uploadHitCount
                channelHitCount
                organizationHitCount
                transcriptHitCount
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
        },
      );
    },
    {
      key: () => [
        'search',
        location.query['q'],
        location.query['focus'],
        location.query['after'],
        location.query['before'],
      ],
    },
  );
}

type SearchHitRowProps = Omit<ThumbnailProps, 'width' | 'height' | 'url'> &
  ParentProps<{
    thumbnailUrl?: string | null | undefined;
    title: string;
    channelName: string;
    channelId: string;
    marked?: boolean;
    class?: string | undefined;
  }>;

function SearchHitRow(props: SearchHitRowProps) {
  return (
    <div class={`flex space-x-5 ${props.class ?? ''}`}>
      <div>
        <Thumbnail
          url={props.thumbnailUrl}
          blurhash={props.blurhash}
          width={352}
          height={198}
          placeholder={props.placeholder}
        />
      </div>
      <div class="flex-grow space-y-2">
        <h3 class="text-2xl font-semibold">{props.title}</h3>
        <p class="text-sm text-gray-500">123 Views &middot; 3 Days Ago</p>
        <p class="text-sm text-gray-500">
          {props.channelName} &middot; {props.channelId}
        </p>
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
      <dl class="space-y-1 rounded-md bg-gray-50 p-3">
        <For each={local.innerHits.slice(0, showMore() ? undefined : 1)}>
          {(hit) => (
            <div
              class="group/t-row flex gap-2 hover:cursor-pointer"
              classList={{ group: showMore() }}
            >
              <dt class="font-mono w-10 items-center text-sm font-medium uppercase text-gray-400 group-hover/t-row:text-gray-600">
                {prettyMs(hit.start, {
                  colonNotation: true,
                  secondsDecimalDigits: 0,
                })}
              </dt>
              <dd
                class="[&_mark]:in-expo [&_mark]:out-expo text-sm [&_mark]:bg-transparent [&_mark]:transition-colors [&_mark]:duration-200 group-hover:[&_mark]:bg-yellow-200"
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={hit.text.marked ?? ''}
              />
            </div>
          )}
        </For>
      </dl>
      <Show when={local.innerHits.length > 1}>
        <button
          onClick={() => setShowMore((sm) => !sm)}
          class="text-xs font-medium uppercase text-gray-400"
        >
          Show {local.innerHits.length - 1} {showMore() ? 'Less' : 'More'}
        </button>
      </Show>
    </SearchHitRow>
  );
}

export default function SearchRoute() {
  const data = useRouteData<typeof routeData>();
  const loc = useLocation();

  return (
    <div class="space-y-5">
      <nav class="flex space-x-5" aria-label="Search Focus">
        <For
          each={[
            {
              title: 'Media',
              focus: 'uploads',
              count: data()?.search.aggs.uploadHitCount,
            },
            {
              title: 'Transcripts',
              focus: 'transcripts',
              count: data()?.search.aggs.transcriptHitCount,
            },
          ]}
        >
          {({ title, focus, count }) => {
            const current = () =>
              loc.query['focus'] === focus ||
              (!loc.query['focus'] && focus === 'uploads');

            return (
              <A
                href={`?${new URLSearchParams({
                  q: loc.query['q'] ?? '',
                  focus,
                })}`}
                class={`flex whitespace-nowrap border-b-2 border-transparent py-4 px-1 text-sm font-medium ${
                  current()
                    ? 'text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {title}{' '}
                <span
                  class={`ml-3 hidden rounded-full py-0.5 px-2.5 text-xs font-medium md:inline-block ${
                    current()
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {count}
                </span>
              </A>
            );
          }}
        </For>
      </nav>
      <For each={data()?.search.edges}>
        {(edge) => (
          <Switch>
            <Match
              when={edge.node.__typename === 'UploadSearchHit' && edge.node}
              keyed
            >
              {(node) => (
                <SearchHitRow
                  thumbnailUrl={node.uploadRecord.thumbnailUrl}
                  blurhash={node.uploadRecord.thumbnailBlurhash}
                  title={node.title}
                  channelName={node.uploadRecord.channel.name}
                  channelId={node.uploadRecord.channel.id}
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
                  thumbnailUrl={node.uploadRecord.thumbnailUrl}
                  blurhash={node.uploadRecord.thumbnailBlurhash}
                  title={node.uploadRecord.title ?? 'Untitled'}
                  channelName={node.uploadRecord.channel.name}
                  channelId={node.uploadRecord.channel.id}
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
