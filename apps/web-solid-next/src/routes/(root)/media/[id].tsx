import { createSignal, Show, For, createEffect, onMount } from 'solid-js';
import { getRequestEvent, isServer } from 'solid-js/web';
import { useFloating } from 'solid-floating-ui';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
import DownloadIcon from '@tabler/icons/cloud-download.svg?component-solid';
import ShareIcon from '@tabler/icons/share-2.svg?component-solid';
import invariant from 'tiny-invariant';
import humanFormat from 'human-format';
import pluralize from 'pluralize';
import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  action,
  cache,
  createAsync,
  redirect,
  useLocation,
  useParams,
  useSubmission,
} from '@solidjs/router';
import { Title } from '@solidjs/meta';
import type {
  MediaRouteMetaDataQuery,
  MediaRouteMetaDataQueryVariables,
  ModifySubscriptionMutation,
  ModifySubscriptionMutationVariables,
  UpsertCommentMutation,
  UpsertCommentMutationVariables,
  SubmitUploadCommentRatingMutation,
  SubmitUploadCommentRatingMutationVariables,
  MediaRouteRecordViewMutation,
  MediaRouteRecordViewMutationVariables,
} from './__generated__/[id]';
import Transcript from '~/components/media/transcript';
import {
  getAuthenticatedClient,
  getAuthenticatedClientOrRedirect,
} from '~/util/gql/server';
import { Rating } from '~/__generated__/graphql-types';
import Player from '~/components/media/player';
import Comment, { CommentForm } from '~/components/comment';
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

const recordView = async (id: string) => {
  'use server';
  const client = await getAuthenticatedClient();

  const res = await client.request<
    MediaRouteRecordViewMutation,
    MediaRouteRecordViewMutationVariables
  >(
    gql`
      mutation MediaRouteRecordView($id: ShortUuid!) {
        recordUploadView(uploadRecordId: $id)
      }
    `,
    { id },
  );

  return res;
};

const loadMediaMetadata = cache(async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const id = url.pathname.split('/').at(-1);

  invariant(id, 'Missing id');

  const seriesId = url.searchParams.get('seriesId');
  const commentsAfter = url.searchParams.get('commentsAfter');
  const commentsBefore = url.searchParams.get('commentsBefore');

  const client = await getAuthenticatedClient();

  const { data, errors } = await client.rawRequest<
    MediaRouteMetaDataQuery,
    MediaRouteMetaDataQueryVariables
  >(
    gql`
      fragment CommentFields on UploadUserComment {
        id
        uploadRecordId
        author {
          username
          avatarUrl(resize: { width: 96, height: 96 })
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
          lengthSeconds
          description
          publishedAt
          totalViews
          channel {
            id
            slug
            name
            avatarUrl(resize: { width: 96, height: 96 })
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

  if (errors && errors.length > 0) {
    throw redirect('/404');
  }

  return data;
}, 'media-meta');

export const route: RouteDefinition = {
  load: () => loadMediaMetadata(),
};

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

const submitSubscribe = action(async (form: FormData) => {
  'use server';
  const action = form.get('action');
  const channelId = form.get('channelId');

  invariant(
    typeof channelId === 'string',
    'No channelId provided to submitSubscribe',
  );

  const client = await getAuthenticatedClientOrRedirect();

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
});

const submitCommentRating = action(async (form: FormData) => {
  'use server';
  const uploadRecordId = form.get('uploadRecordById');
  const uploadUserCommentId = form.get('uploadUserCommentId');
  const rating = form.get('rating') === 'LIKE' ? Rating.Like : Rating.Dislike;
  invariant(
    typeof uploadUserCommentId === 'string',
    'No uploadUserCommentId provided to submitCommentRating',
  );

  const client = await getAuthenticatedClientOrRedirect();

  await client.request<
    SubmitUploadCommentRatingMutation,
    SubmitUploadCommentRatingMutationVariables
  >(
    gql`
      mutation SubmitUploadCommentRating(
        $uploadUserCommentId: ShortUuid!
        $rating: Rating!
      ) {
        rateComment(uploadUserCommentId: $uploadUserCommentId, rating: $rating)
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
});

const submitComment = action(async (form: FormData) => {
  'use server';
  const text = form.get('text');
  invariant(typeof text === 'string', 'No comment text provided');
  const uploadRecordId = form.get('uploadRecordId');
  invariant(typeof uploadRecordId === 'string', 'No uploadRecordId provided');
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

  const client = await getAuthenticatedClientOrRedirect();

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

  throw redirect(`/media/${uploadRecordId}`);
});

export default function MediaRoute() {
  const user = useUser();
  const params = useParams<{ id: string }>();
  const loc = useLocation();
  const metadata = createAsync(loadMediaMetadata);

  onMount(() => {
    if (!isServer) {
      recordView(params.id);
    }
  });

  const subscribeSubmission = useSubmission(submitSubscribe);

  const userIsSubscribed = () => {
    return (
      subscribeSubmission?.input?.[0].get('action') === 'subscribe' ||
      metadata()?.data?.channel.userIsSubscribed
    );
  };

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

  const commentSubmission = useSubmission(submitComment);

  createEffect(() => {
    if (!commentSubmission.pending) {
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
      title: metadata()?.data.title ?? 'No title',
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
      <Title>{metadata()?.data.title ?? '...'} | Let's Church</Title>
      <Og
        title={
          metadata()?.data.title
            ? `${metadata()?.data.title} | Let's Church`
            : "Let's Church"
        }
        description={metadata()?.data.description ?? ''}
        image={
          metadata()?.data.thumbnailUrl ??
          metadata()?.data.channel.defaultThumbnailUrl
        }
      />
      <div class="md:grid md:grid-cols-3 md:gap-4">
        <div class="space-y-4 md:col-span-2">
          <Player
            id={params.id}
            videoSource={metadata()?.data.mediaSource}
            audioSource={metadata()?.data.audioSource}
            peaksDatUrl={metadata()?.data.peaksDatUrl}
            peaksJsonUrl={metadata()?.data.peaksJsonUrl}
            playAt={playAt}
            onTimeUpdate={setCurrentTime}
            lengthSeconds={metadata()?.data.lengthSeconds ?? 0}
            fluid
          />
          <h1 class="truncate text-2xl">{metadata()?.data.title ?? '...'}</h1>
          <div class="flex flex-col gap-3 lg:flex-row lg:justify-between lg:overflow-x-auto">
            <div class="flex justify-start gap-3">
              <a
                href={`/channel/${metadata()?.data.channel.slug}`}
                class="relative z-10 inline-flex w-max min-w-0 items-center space-x-2 overflow-hidden whitespace-nowrap"
              >
                <Avatar
                  size="sm"
                  src={metadata()?.data.channel.avatarUrl}
                  alt={`${metadata()?.data.channel.name} icon`}
                />
                <span class="overflow-hidden text-ellipsis text-sm text-gray-500">
                  {metadata()?.data.channel.name}
                </span>
              </a>
              <form
                action={submitSubscribe}
                method="post"
                class="isolate inline-flex rounded-md shadow-sm"
                // TODO: port
                // replace
              >
                <input
                  type="hidden"
                  name="channelId"
                  value={metadata()?.data.channel.id ?? ''}
                />
                <UnderbarButton
                  type="submit"
                  name="action"
                  value={userIsSubscribed() ? 'unsubscribe' : 'subscribe'}
                  classList={{
                    'text-indigo-700': userIsSubscribed(),
                    'border-indigo-700': userIsSubscribed(),
                  }}
                  disabled={subscribeSubmission.pending}
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
              </form>
            </div>
            <div class="flex gap-3 max-lg:overflow-x-auto">
              <Show
                when={
                  metadata()?.data.downloadsEnabled &&
                  (metadata()?.data.downloadUrls?.length ?? 0 > 0)
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
                    data={metadata()?.data.downloadUrls ?? []}
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
                {humanFormat(metadata()?.data.totalViews ?? 0)}{' '}
                {pluralize('view', metadata()?.data.totalViews ?? 0)}
              </p>
              <Show when={metadata()?.data.publishedAt} keyed>
                {(date) => (
                  <time datetime={date} class="text-gray-600">
                    {formatDateFull(new Date(date))}
                  </time>
                )}
              </Show>
            </div>
            <Show when={metadata()?.data.description} keyed>
              {(desc) => <div class="whitespace-pre-line">{desc}</div>}
            </Show>
          </div>
          <Show
            when={metadata()?.data.userCommentsEnabled}
            fallback={
              <p class="rounded-md bg-gray-100 p-3 text-gray-400">
                Comments are disabled.
              </p>
            }
          >
            <form
              action={submitComment}
              method="post"
              onSubmit={handleSubmittingCommentForm}
            >
              <input
                type="hidden"
                name="uploadRecordId"
                value={metadata()?.data.id ?? ''}
              />
              <CommentForm
                placeholder="Add your comment..."
                pending={commentSubmission.pending}
              />
              <p class="font-medium text-gray-900">
                {metadata()?.data.userComments.totalCount} comments
              </p>
              <For each={metadata()?.data.userComments.edges}>
                {(edge) => (
                  <Comment
                    data={edge.node}
                    replies={edge.node.replies.edges.map((e) => e.node)}
                    replyAction={submitComment}
                    rateAction={submitCommentRating}
                    onSubmit={handleSubmittingCommentForm}
                    pending={commentSubmission.pending}
                  />
                )}
              </For>
              <Pagination
                queryKey="comments"
                hasNextPage={
                  metadata()?.data.userComments.pageInfo.hasNextPage ?? false
                }
                hasPreviousPage={
                  metadata()?.data.userComments.pageInfo.hasPreviousPage ??
                  false
                }
                startCursor={
                  metadata()?.data.userComments.pageInfo.startCursor ?? ''
                }
                endCursor={
                  metadata()?.data.userComments.pageInfo.endCursor ?? ''
                }
              />
            </form>
          </Show>
        </div>
        <div class="space-y-4 md:col-span-1">
          <Show when={metadata()?.data.series} keyed>
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
                          <a
                            href={`/media/${edge.node.upload.id}${loc.search}`}
                            class="before:absolute before:inset-0"
                          >
                            {edge.node.upload.title}
                          </a>
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
            transcript={metadata()?.data.transcript ?? []}
            currentTime={currentTime() * 1000}
            setPlayAt={setPlayAt}
          />
        </div>
      </div>
    </>
  );
}
