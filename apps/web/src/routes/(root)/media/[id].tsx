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
import {
  type JSX,
  splitProps,
  useContext,
  createResource,
  untrack,
  createSignal,
  Show,
  Switch,
  Match,
  For,
  createEffect,
  onMount,
} from 'solid-js';
import { isServer } from 'solid-js/web';
import { useFloating } from 'solid-floating-ui';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
import DownloadIcon from '@tabler/icons/cloud-download.svg?component-solid';
// TODO: use share-2 once on tabler icons v2.5+
import ShareIcon from '@tabler/icons/share.svg?component-solid';
import invariant from 'tiny-invariant';
import humanFormat from 'human-format';
import pluralize from 'pluralize';
import type {
  MediaRouteMetaDataQuery,
  MediaRouteMetaDataQueryVariables,
  MediaRouteRatingStateQuery,
  MediaRouteRatingStateQueryVariables,
  SubmitUploadRatingMutation,
  SubmitUploadRatingMutationVariables,
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
  gql,
} from '~/util/gql/server';
import { UserContext } from '~/routes/(root)';
import { Rating } from '~/__generated__/graphql-types';
import Video from '~/components/video';
import Comment, { CommentForm } from '~/components/comment';
import Transcript from '~/components/transcript';
import FloatingShareMenu from '~/components/floating-share-menu';
import { formatDateFull } from '~/util/date';
import type { Optional } from '~/util';
import Pagination from '~/components/pagination';
import { Avatar } from '~/components/avatar';
import FloatingDownloadMenu from '~/components/floating-download-menu';

const COMMENTS_PAGE_SIZE = 12;

function UnderbarButton(props: JSX.IntrinsicElements['button']) {
  const [localProps, restProps] = splitProps(props, ['class']);
  return (
    <button
      {...restProps}
      class={`relative inline-flex items-center space-x-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 first-of-type:rounded-l-md last-of-type:rounded-r-md only-of-type:shadow-sm hover:bg-gray-50 focus:z-10 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 [&:not(:first-of-type)]:-ml-px ${
        localProps.class ?? ''
      }`}
    />
  );
}

function RatingButton(
  props: {
    count: number;
    value: Rating;
    active: boolean;
  } & Omit<
    JSX.IntrinsicElements['button'],
    'class' | 'onClick' | 'value' | 'children'
  >,
) {
  const [localProps, restProps] = splitProps(props, [
    'count',
    'value',
    'active',
  ]);

  return (
    <UnderbarButton
      type="submit"
      name="rating"
      value={localProps.value}
      class="min-w-[80px]"
      classList={{
        'bg-indigo-50': localProps.active,
        'text-indigo-700': localProps.active,
      }}
      {...restProps}
    >
      <Switch>
        <Match when={localProps.value === Rating.Like}>
          <ThumbUpIcon class="pointer-events-none scale-90" />
        </Match>
        <Match when={localProps.value === Rating.Dislike}>
          <ThumbDownIcon class="pointer-events-none -scale-x-90 scale-y-90" />
        </Match>
      </Switch>
      <span>{localProps.count}</span>
    </UnderbarButton>
  );
}

export function routeData({ params, location }: RouteDataArgs) {
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

  // Use resource rather than createRouteData or createServerData for the rating state. We don't
  // want any of the cache invalidation / automatic data refetching logic for rating. Local mutation
  // is better than refetching for rating data as numbers changing wildly when clicking like or dislike
  // can appear to be a bug. Resources have this mutation functionality built in.
  const fetchRatingState = server$(async (id: string) => {
    const client = await createAuthenticatedClient(server$.request);
    invariant(id, "No id provided to routeData for '/media/[id]'");

    const res = await client.request<
      MediaRouteRatingStateQuery,
      MediaRouteRatingStateQueryVariables
    >(
      gql`
        query MediaRouteRatingState($id: ShortUuid!) {
          data: uploadRecordById(id: $id) {
            totalLikes
            totalDislikes
            myRating
          }
        }
      `,
      { id },
    );

    return res;
  });

  const id = params['id'];
  invariant(id, 'No id provided to media route');

  const ratingState = createResource(() => fetchRatingState(id));

  const metaData = createServerData$(
    async (
      [, id, , commentsAfter = null, commentsBefore = null],
      { request },
    ) => {
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
                name
                avatarUrl
                userIsSubscribed
              }
              mediaSource
              audioSource
              peaksDatUrl
              peaksJsonUrl
              downloadsEnabled
              downloadUrls {
                kind
                label
                url
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
          id,
          'meta',
          location.query['commentsAfter'],
          location.query['commentsBefore'],
        ] as const,
    },
  );

  return {
    recordView: () => recordView(id),
    ratingState,
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
  const user = useContext(UserContext);
  const params = useParams<{ id: string }>();
  const {
    ratingState: [
      ratingStateData,
      { mutate: mutateRating, refetch: refetchRatingState },
    ],
    metaData,
    recordView,
  } = useRouteData<typeof routeData>();

  onMount(() => {
    if (!isServer) {
      recordView();
    }
  });

  let prevMe: Optional<{ id: string }> = null;

  // Refetch rating state when user logs in or out
  createEffect(() => {
    const next = user?.()?.me;

    if (prevMe?.id !== next?.id) {
      refetchRatingState();
    }

    prevMe = next;
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

  const [submittingRating, submitRating] = createServerAction$(
    async (form: FormData, { request }) => {
      const uploadRecordId = form.get('uploadRecordId');
      const rating =
        form.get('rating') === 'LIKE' ? Rating.Like : Rating.Dislike;
      invariant(
        typeof uploadRecordId === 'string',
        'No uploadRecordId provided to submitRating',
      );

      const client = await createAuthenticatedClientOrRedirect(request);

      await client.request<
        SubmitUploadRatingMutation,
        SubmitUploadRatingMutationVariables
      >(
        gql`
          mutation SubmitUploadRating(
            $uploadRecordId: ShortUuid!
            $rating: Rating!
          ) {
            rateUpload(uploadRecordId: $uploadRecordId, rating: $rating)
          }
        `,
        {
          uploadRecordId,
          rating,
        },
      );

      return redirect(`/media/${uploadRecordId}`);
    },
    { invalidate: [] },
  );

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

  function handleRating(newRating: Rating) {
    const ratingState = untrack(() => ratingStateData()?.data);

    if (!ratingState) {
      return;
    }

    // New rating
    if (!ratingState.myRating) {
      return mutateRating({
        data: {
          ...ratingState,
          totalLikes:
            ratingState.totalLikes + (newRating === Rating.Like ? 1 : 0),
          totalDislikes:
            ratingState.totalDislikes + (newRating === Rating.Dislike ? 1 : 0),
          myRating: newRating,
        },
      });
    }

    // Undo rating
    if (ratingState.myRating === newRating) {
      return mutateRating({
        data: {
          ...ratingState,
          totalLikes:
            ratingState.totalLikes - (newRating === Rating.Like ? 1 : 0),
          totalDislikes:
            ratingState.totalDislikes - (newRating === Rating.Dislike ? 1 : 0),
          myRating: null,
        },
      });
    }

    // Change rating
    return mutateRating({
      data: {
        ...ratingState,
        totalLikes:
          ratingState.totalLikes + (newRating === Rating.Like ? 1 : -1),
        totalDislikes:
          ratingState.totalDislikes + (newRating === Rating.Dislike ? 1 : -1),
        myRating: newRating,
      },
    });
  }

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
    if (!user?.()?.me) {
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
          <div class="flex justify-between gap-3 overflow-x-auto">
            <div class="flex gap-3">
              <A
                href={`/channel/${metaData()?.data.channel.id}`}
                class="relative z-10 inline-flex min-w-0 items-center space-x-2 whitespace-nowrap"
              >
                <Avatar
                  size="sm"
                  src={metaData()?.data.channel.avatarUrl}
                  alt={`${metaData()?.data.channel.name} icon`}
                />
                <span class="text-sm text-gray-500">
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
                >
                  <SubscribeIcon class="scale-90" />{' '}
                  <span>{userIsSubscribed() ? 'Subscribed' : 'Subscribe'}</span>
                </UnderbarButton>
              </submitSubscribe.Form>
            </div>
            <div class="flex gap-3">
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
              <submitRating.Form
                class="isolate inline-flex rounded-md shadow-sm"
                replace
                onSubmit={(e) => {
                  if (!user?.()?.me) {
                    e.preventDefault();
                    // TODO: show login
                    return alert('Not logged in!');
                  }

                  // Optimistic update
                  if (
                    e.submitter instanceof HTMLButtonElement &&
                    e.submitter.value === 'LIKE'
                  ) {
                    handleRating(Rating.Like);
                  } else {
                    handleRating(Rating.Dislike);
                  }
                }}
              >
                <input type="hidden" name="uploadRecordId" value={params.id} />
                <RatingButton
                  count={ratingStateData()?.data.totalLikes ?? 0}
                  value={Rating.Like}
                  active={ratingStateData()?.data.myRating === Rating.Like}
                  disabled={submittingRating.pending}
                />
                <RatingButton
                  count={ratingStateData()?.data.totalDislikes ?? 0}
                  value={Rating.Dislike}
                  active={ratingStateData()?.data.myRating === Rating.Dislike}
                  disabled={submittingRating.pending}
                />
              </submitRating.Form>
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
        <div class="md:col-span-1">
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
