import {
  type RouteDataArgs,
  Title,
  useParams,
  useRouteData,
  A,
  useLocation,
} from 'solid-start';
import server$, {
  createServerAction$,
  createServerData$,
  redirect,
} from 'solid-start/server';
import { createSignal, Show, For, createEffect, onMount } from 'solid-js';
import { isServer } from 'solid-js/web';
import { useFloating } from 'solid-floating-ui';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
import DownloadIcon from '@tabler/icons/cloud-download.svg?component-solid';
// TODO: use share-2 once on tabler icons v2.5+
import ShareIcon from '@tabler/icons/share.svg?component-solid';
import invariant from 'tiny-invariant';
import humanFormat from 'human-format';
import pluralize from 'pluralize';
import { gql } from 'graphql-request';
import type {
  MediaRouteMetaDataQuery,
  MediaRouteMetaDataQueryVariables,
  ModifySubscriptionMutation,
  ModifySubscriptionMutationVariables,
  UpsertCommentMutation,
  UpsertCommentMutationVariables,
  SubmitUploadCommentRatingMutation,
  SubmitUploadCommentRatingMutationVariables,
} from './__generated__/[id]';
import {
  createAuthenticatedClient,
  createAuthenticatedClientOrRedirect,
} from '~/util/gql/server';
import { Rating } from '~/__generated__/graphql-types';
import Video from '~/components/video';
import Comment, { CommentForm } from '~/components/comment';
import Transcript from '~/components/transcript';
import FloatingShareMenu from '~/components/floating-share-menu';
import { formatDateFull } from '~/util/date';
import Pagination from '~/components/pagination';
import { Avatar } from '~/components/avatar';
import FloatingDownloadMenu from '~/components/floating-download-menu';
import { useUser } from '~/util/user-context';
import Og from '~/components/og';
import UnderbarButton from '~/components/media/underbar-button';
import RatingButtons from '~/components/media/rating';

const COMMENTS_PAGE_SIZE = 12;

export function routeData({ params, location }: RouteDataArgs) {
  const idParam = params['id'];
  invariant(idParam, 'No id provided to media route');

  const recordView = server$(async (id: string) => {
    const client = await createAuthenticatedClient(server$.request);

    const res = await client.request(
      gql`
        mutation MediaRouteRecordView($id: ShortUuid!) {
          recordUploadView(uploadRecordId: $id)
        }
      `,
      { id },
    );

    return res;
  });

  const metaData = createServerData$(
    async (
      [, id, , seriesId = null, commentsAfter = null, commentsBefore = null],
      { request },
    ) => {
      invariant(id, 'No id provided to media route (metaData)');
      const client = await createAuthenticatedClient(request);

      return client.request<
        MediaRouteMetaDataQuery,
        MediaRouteMetaDataQueryVariables
      >(
        gql`
          fragment CommentFields on UploadUserComment {
            id
            uploadRecordId
            author {
              username
              avatarUrl
            }
            createdAt
            updatedAt
            text
            totalLikes
            totalDislikes
            myRating
          }

          query MediaRouteMetaData(
            $id: ShortUuid!
            $seriesId: ShortUuid
            $commentsFirst: Int
            $commentsAfter: String
            $commentsLast: Int
            $commentsBefore: String
          ) {
            data: uploadRecordById(id: $id) {
              id
              title
              description
              publishedAt
              totalViews
              channel {
                id
                slug
                name
                avatarUrl
                defaultThumbnailUrl
                userIsSubscribed
              }
              mediaSource
              audioSource
              thumbnailUrl
              peaksDatUrl
              peaksJsonUrl
              downloadsEnabled
              downloadUrls {
                kind
                label
                url
              }
              series: uploadListById(id: $seriesId) {
                id
                title
                uploads {
                  edges {
                    node {
                      upload {
                        id
                        title
                      }
                    }
                  }
                }
              }
              transcript {
                start
                text
              }
              userCommentsEnabled
              userComments(
                first: $commentsFirst
                after: $commentsAfter
                last: $commentsLast
                before: $commentsBefore
              ) {
                totalCount
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
                edges {
                  node {
                    ...CommentFields
                    replies {
                      totalCount
                      edges {
                        node {
                          ...CommentFields
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        {
          id,
          seriesId,
          commentsAfter,
          commentsBefore,
          commentsFirst:
            commentsAfter || !commentsBefore ? COMMENTS_PAGE_SIZE : null,
          commentsLast: commentsBefore ? COMMENTS_PAGE_SIZE : null,
        },
      );
    },
    {
      key: () =>
        [
          'media',
          params['id'],
          'meta',
          location.query['series'],
          location.query['commentsAfter'],
          location.query['commentsBefore'],
        ] as const,
    },
  );

  return {
    recordView: () => recordView(idParam),
    metaData,
  };
}

function getStartAt() {
  if (isServer) {
    return undefined;
  }

  const loc = useLocation();

  const hashParams = new URLSearchParams(loc.hash.slice(1));
  const t = hashParams.get('t');

  if (t) {
    return parseInt(t);
  }

  return undefined;
}

export default function MediaRoute() {
  const user = useUser();
  const params = useParams<{ id: string }>();
  const loc = useLocation();
  const { metaData, recordView } = useRouteData<typeof routeData>();

  onMount(() => {
    if (!isServer) {
      recordView();
    }
  });

  const [submittingSubscribe, submitSubscribe] = createServerAction$(
    async (form: FormData, { request }) => {
      const action = form.get('action');
      const channelId = form.get('channelId');

      invariant(
        typeof channelId === 'string',
        'No channelId provided to submitSubscribe',
      );

      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<
        ModifySubscriptionMutation,
        ModifySubscriptionMutationVariables
      >(
        gql`
          mutation ModifySubscription(
            $channelId: ShortUuid!
            $subscribe: Boolean!
          ) {
            subscribeToChannel(channelId: $channelId) @include(if: $subscribe) {
              channel {
                id
                userIsSubscribed
              }
            }
            unsubscribeFromChannel(channelId: $channelId) @skip(if: $subscribe)
          }
        `,
        {
          channelId,
          subscribe: action === 'subscribe',
        },
      );
    },
    {
      invalidate: ['media', params.id, 'meta'],
    },
  );

  const userIsSubscribed = () => {
    return (
      submittingSubscribe?.input?.get('action') === 'subscribe' ||
      metaData()?.data?.channel.userIsSubscribed
    );
  };

  const [, submitCommentRating] = createServerAction$(
    async (form: FormData, { request }) => {
      const uploadRecordId = form.get('uploadRecordById');
      const uploadUserCommentId = form.get('uploadUserCommentId');
      const rating =
        form.get('rating') === 'LIKE' ? Rating.Like : Rating.Dislike;
      invariant(
        typeof uploadUserCommentId === 'string',
        'No uploadUserCommentId provided to submitCommentRating',
      );

      const client = await createAuthenticatedClientOrRedirect(request);

      await client.request<
        SubmitUploadCommentRatingMutation,
        SubmitUploadCommentRatingMutationVariables
      >(
        gql`
          mutation SubmitUploadCommentRating(
            $uploadUserCommentId: ShortUuid!
            $rating: Rating!
          ) {
            rateComment(
              uploadUserCommentId: $uploadUserCommentId
              rating: $rating
            )
          }
        `,
        {
          uploadUserCommentId,
          rating,
        },
      );

      if (uploadRecordId) {
        return redirect(`/media/${uploadRecordId}`);
      }

      return null;
    },
    { invalidate: [] },
  );

  const [submittingComment, submitComment] = createServerAction$(
    async (form: FormData, { request }) => {
      const text = form.get('text');
      invariant(typeof text === 'string', 'No comment text provided');
      const uploadRecordId = form.get('uploadRecordId');
      invariant(
        typeof uploadRecordId === 'string',
        'No uploadRecordId provided',
      );
      const replyingTo = form.get('replyingTo');
      invariant(
        replyingTo === null || typeof replyingTo === 'string',
        'Invalid replyingTo provided',
      );
      const commentId = form.get('commentId');
      invariant(
        commentId === null || typeof commentId === 'string',
        'Invalid commentId provided',
      );

      const client = await createAuthenticatedClientOrRedirect(request);

      client.request<UpsertCommentMutation, UpsertCommentMutationVariables>(
        gql`
          mutation UpsertComment(
            $uploadRecordId: ShortUuid!
            $replyingTo: ShortUuid
            $text: String!
            $commentId: ShortUuid
          ) {
            upsertUploadUserComment(
              uploadRecordId: $uploadRecordId
              replyingTo: $replyingTo
              text: $text
              commentId: $commentId
            ) {
              id
            }
          }
        `,
        {
          uploadRecordId,
          replyingTo,
          text,
          commentId,
        },
      );

      return redirect(`/media/${uploadRecordId}`);
    },
    {
      invalidate: ['media', params.id, 'meta'],
    },
  );

  let submittingCommentForm: HTMLFormElement | null = null;

  function handleSubmittingCommentForm(e: SubmitEvent) {
    if (!user()) {
      e.preventDefault();
      // TODO: show login
      return alert('Not logged in!');
    }

    if (e.target instanceof HTMLFormElement) {
      submittingCommentForm = e.target;
    } else {
      submittingCommentForm = null;
    }
  }

  createEffect(() => {
    if (!submittingComment.pending && !submittingComment.error) {
      submittingCommentForm?.reset();
    }
  });

  const startAt = getStartAt();
  const [playAt, setPlayAt] = createSignal(startAt ?? 0);
  const [currentTime, setCurrentTime] = createSignal(startAt ?? 0);

  const [downloadFloatOpen, setDownloadFloatOpen] = createSignal(false);
  const [downloadButtonRef, setDownloadButtonRef] =
    createSignal<HTMLButtonElement>();
  const [floatingDownloadMenu, setFloatingDownloadMenu] =
    createSignal<HTMLDivElement>();
  const downloadPosition = useFloating(
    downloadButtonRef,
    floatingDownloadMenu,
    {
      placement: 'bottom',
    },
  );
  const [shareFloatOpen, setShareFloatOpen] = createSignal(false);
  const [shareButtonRef, setShareButtonRef] = createSignal<HTMLButtonElement>();
  const [floatingShareMenu, setFloatingShareMenu] =
    createSignal<HTMLDivElement>();
  const sharePosition = useFloating(shareButtonRef, floatingShareMenu, {
    placement: 'top',
  });

  function getShareData() {
    return {
      title: metaData()?.data.title ?? 'No title',
      text: metaData()?.data.description?.split(/\n+/g)?.[0] ?? '',
      url: location.href,
    };
  }

  async function handleShare() {
    const data = getShareData();
    if (navigator.canShare?.(data)) {
      return navigator.share(data);
    }

    setShareFloatOpen(true);
  }

  return (
    <>
      <Title>{metaData()?.data.title ?? '...'} | Let's Church</Title>
      <Og
        title={
          metaData()?.data.title
            ? `${metaData()?.data.title} | Let's Church`
            : "Let's Church"
        }
        description={metaData()?.data.description ?? ''}
        image={
          metaData()?.data.thumbnailUrl ??
          metaData()?.data.channel.defaultThumbnailUrl
        }
      />
      <div class="md:grid md:grid-cols-3 md:gap-4">
        <div class="space-y-4 md:col-span-2">
          <Video
            videoSource={metaData()?.data.mediaSource}
            audioSource={metaData()?.data.audioSource}
            peaksDatUrl={metaData()?.data.peaksDatUrl}
            peaksJsonUrl={metaData()?.data.peaksJsonUrl}
            playAt={playAt}
            onTimeUpdate={setCurrentTime}
            fluid
          />
          <h1 class="truncate text-2xl">{metaData()?.data.title ?? '...'}</h1>
          <div class="flex flex-col gap-3 lg:flex-row lg:justify-between lg:overflow-x-auto">
            <div class="flex justify-start gap-3">
              <A
                href={`/channel/${metaData()?.data.channel.slug}`}
                class="relative z-10 inline-flex w-max min-w-0 items-center space-x-2 overflow-hidden whitespace-nowrap"
              >
                <Avatar
                  size="sm"
                  src={metaData()?.data.channel.avatarUrl}
                  alt={`${metaData()?.data.channel.name} icon`}
                />
                <span class="overflow-hidden text-ellipsis text-sm text-gray-500">
                  {metaData()?.data.channel.name}
                </span>
              </A>
              <submitSubscribe.Form
                class="isolate inline-flex rounded-md shadow-sm"
                replace
              >
                <input
                  type="hidden"
                  name="channelId"
                  value={metaData()?.data.channel.id ?? ''}
                />
                <UnderbarButton
                  type="submit"
                  name="action"
                  value={userIsSubscribed() ? 'unsubscribe' : 'subscribe'}
                  classList={{
                    'text-indigo-700': userIsSubscribed(),
                    'border-indigo-700': userIsSubscribed(),
                  }}
                  disabled={submittingSubscribe.pending}
                  onClick={(e) => {
                    if (!user()) {
                      e.preventDefault();
                      alert('Not logged in!');
                    }
                  }}
                >
                  <SubscribeIcon class="scale-90" />{' '}
                  <span>{userIsSubscribed() ? 'Subscribed' : 'Subscribe'}</span>
                </UnderbarButton>
              </submitSubscribe.Form>
            </div>
            <div class="flex gap-3 max-lg:overflow-x-auto">
              <Show
                when={
                  metaData()?.data.downloadsEnabled &&
                  (metaData()?.data.downloadUrls?.length ?? 0 > 0)
                }
              >
                <div>
                  <UnderbarButton
                    ref={setDownloadButtonRef}
                    onClick={() => setDownloadFloatOpen(true)}
                  >
                    <DownloadIcon class="scale-90" /> <span>Download</span>
                  </UnderbarButton>
                  <FloatingDownloadMenu
                    ref={setFloatingDownloadMenu}
                    data={metaData()?.data.downloadUrls ?? []}
                    open={downloadFloatOpen()}
                    onClose={() => setDownloadFloatOpen(false)}
                    position={downloadPosition}
                    class="mt-2"
                  />
                </div>
              </Show>
              <div>
                <UnderbarButton
                  ref={setShareButtonRef}
                  onClick={() => handleShare()}
                >
                  <ShareIcon class="scale-90" /> <span>Share</span>
                </UnderbarButton>
                <FloatingShareMenu
                  ref={setFloatingShareMenu}
                  data={getShareData()}
                  open={shareFloatOpen()}
                  onClose={() => setShareFloatOpen(false)}
                  position={sharePosition}
                />
              </div>
              <RatingButtons id={params.id} />
            </div>
          </div>
          <div class="space-y-2 rounded-md bg-gray-100 p-3">
            <div class="flex items-center gap-3 text-sm">
              <p class="font-medium text-gray-900">
                {humanFormat(metaData()?.data.totalViews ?? 0)}{' '}
                {pluralize('view', metaData()?.data.totalViews ?? 0)}
              </p>
              <Show when={metaData()?.data.publishedAt} keyed>
                {(date) => (
                  <time datetime={date} class="text-gray-600">
                    {formatDateFull(new Date(date))}
                  </time>
                )}
              </Show>
            </div>
            <Show when={metaData()?.data.description} keyed>
              {(desc) => <div class="whitespace-pre-line">{desc}</div>}
            </Show>
          </div>
          <Show
            when={metaData()?.data.userCommentsEnabled}
            fallback={
              <p class="rounded-md bg-gray-100 p-3 text-gray-400">
                Comments are disabled.
              </p>
            }
          >
            <submitComment.Form onSubmit={handleSubmittingCommentForm}>
              <input
                type="hidden"
                name="uploadRecordId"
                value={metaData()?.data.id ?? ''}
              />
              <CommentForm
                placeholder="Add your comment..."
                pending={submittingComment.pending}
              />
              <p class="font-medium text-gray-900">
                {metaData()?.data.userComments.totalCount} comments
              </p>
              <For each={metaData()?.data.userComments.edges}>
                {(edge) => (
                  <Comment
                    data={edge.node}
                    replies={edge.node.replies.edges.map((e) => e.node)}
                    ReplyForm={submitComment.Form}
                    RateForm={submitCommentRating.Form}
                    onSubmit={handleSubmittingCommentForm}
                    pending={submittingComment.pending}
                  />
                )}
              </For>
              <Pagination
                label={
                  <>
                    Showing{' '}
                    <span class="font-medium">
                      {metaData()?.data.userComments.edges.length}
                    </span>{' '}
                    of{' '}
                    <span class="font-medium">
                      {metaData()?.data.userComments.totalCount}
                    </span>{' '}
                    comments
                  </>
                }
                queryKey="comments"
                hasNextPage={
                  metaData()?.data.userComments.pageInfo.hasNextPage ?? false
                }
                hasPreviousPage={
                  metaData()?.data.userComments.pageInfo.hasPreviousPage ??
                  false
                }
                startCursor={
                  metaData()?.data.userComments.pageInfo.startCursor ?? ''
                }
                endCursor={
                  metaData()?.data.userComments.pageInfo.endCursor ?? ''
                }
              />
            </submitComment.Form>
          </Show>
        </div>
        <div class="space-y-4 md:col-span-1">
          <Show when={metaData()?.data.series} keyed>
            {(series) => (
              <div class="relative flex h-[175px] flex-col overflow-hidden rounded-md bg-gray-50">
                <h3 class="inset-x-0 bg-gray-50 px-4 pb-2 pt-4 text-sm font-semibold text-gray-900">
                  {series.title}
                </h3>
                <div class="h-full space-y-4 overflow-y-auto p-4">
                  <For each={series.uploads.edges}>
                    {(edge) => (
                      <div
                        class={`relative rounded-md p-4 ${
                          edge.node.upload.id === params.id
                            ? 'bg-indigo-50'
                            : 'bg-white'
                        }`}
                      >
                        <h4 class="text-sm font-semibold text-gray-900">
                          <A
                            href={`/media/${edge.node.upload.id}${loc.search}`}
                            class="before:absolute before:inset-0"
                          >
                            {edge.node.upload.title}
                          </A>
                        </h4>
                        {/*
                        <time class="text-xs text-gray-600" datetime="PTTODO">
                          TODO
                        </time>
                        */}
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <Transcript
            transcript={metaData()?.data.transcript ?? []}
            currentTime={currentTime() * 1000}
            setPlayAt={setPlayAt}
          />
        </div>
      </div>
    </>
  );
}
