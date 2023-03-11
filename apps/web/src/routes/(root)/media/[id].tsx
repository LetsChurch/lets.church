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
} from 'solid-js';
import { isServer } from 'solid-js/web';
import { useFloating } from 'solid-floating-ui';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
// TODO: use share-2 once on tabler icons v2.5+
import ShareIcon from '@tabler/icons/share.svg?component-solid';
import invariant from 'tiny-invariant';
import type {
  MediaRouteMetaDataQuery,
  MediaRouteMetaDataQueryVariables,
  MediaRouteRatingStateQuery,
  MediaRouteRatingStateQueryVariables,
  SubmitUploadRatingMutation,
  SubmitUploadRatingMutationVariables,
  ModifySubscriptionMutation,
  ModifySubscriptionMutationVariables,
} from './__generated__/[id]';
import {
  createAuthenticatedClient,
  createAuthenticatedClientOrRedirect,
  gql,
} from '~/util/gql/server';
import { UserContext } from '~/routes/(root)';
import { Rating } from '~/__generated__/graphql-types';
import Video from '~/components/video';
import Transcript from '~/components/transcript';
import FloatingShareMenu from '~/components/floating-share-menu';
import { formatDateFull } from '~/util/date';

function UnderbarButton(props: JSX.IntrinsicElements['button']) {
  const [localProps, restProps] = splitProps(props, ['class']);
  return (
    <button
      {...restProps}
      class={`relative inline-flex  items-center space-x-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 first-of-type:rounded-l-md last-of-type:rounded-r-md only-of-type:shadow-sm hover:bg-gray-50 focus:z-10 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 [&:not(:first-of-type)]:-ml-px ${localProps.class}`}
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

export function routeData({ params }: RouteDataArgs) {
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
    async ([, id], { request }) => {
      const client = await createAuthenticatedClient(request);
      const res = await client.request<
        MediaRouteMetaDataQuery,
        MediaRouteMetaDataQueryVariables
      >(
        gql`
          query MediaRouteMetaData($id: ShortUuid!) {
            data: uploadRecordById(id: $id) {
              id
              title
              description
              publishedAt
              channel {
                id
                name
                userIsSubscribed
              }
              mediaSource
              audioSource
              transcript {
                start
                text
              }
            }
          }
        `,
        {
          id,
        },
      );

      return res;
    },
    { key: ['media', id, 'meta'] as const },
  );

  return {
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
    ratingState: [ratingStateData, { mutate: mutateRating }],
    metaData,
  } = useRouteData<typeof routeData>();

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

  const startAt = getStartAt();
  const [currentTime, setCurrentTime] = createSignal(startAt ?? 0);

  const [shareFloatOpen, setShareFloatOpen] = createSignal(false);
  const [shareButtonRef, setShareButtonRef] = createSignal<HTMLButtonElement>();
  const [floatingShareMenu, setFloatingShareMenu] =
    createSignal<HTMLDivElement>();
  const position = useFloating(shareButtonRef, floatingShareMenu, {
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
          <div class="aspect-video w-full bg-gray-100">
            <Video
              source={
                metaData()?.data.mediaSource ??
                metaData()?.data.audioSource ??
                ''
              }
              startAt={startAt}
              onTimeUpdate={(time) => setCurrentTime(time)}
              fluid
            />
          </div>
          <h1 class="truncate text-2xl">{metaData()?.data.title ?? '...'}</h1>
          <div class="flex justify-between gap-3 overflow-x-auto">
            <div class="flex gap-3">
              <A
                href={`/channel/${metaData()?.data.channel.id}`}
                class="relative z-10 inline-flex min-w-0 items-center space-x-2 whitespace-nowrap"
              >
                <img
                  class="h-6 w-6 rounded-full"
                  src="https://images.unsplash.com/photo-1477672680933-0287a151330e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
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
              <FloatingShareMenu
                ref={setFloatingShareMenu}
                data={getShareData()}
                open={shareFloatOpen()}
                onClose={() => setShareFloatOpen(false)}
                position={position}
              />
            </div>
            <div class="flex gap-3">
              <UnderbarButton
                ref={setShareButtonRef}
                onClick={() => handleShare()}
              >
                <ShareIcon class="scale-90" /> <span>Share</span>
              </UnderbarButton>
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
              <p class="font-medium text-gray-900">3.9k views</p>
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
          <div>comments</div>
        </div>
        <div class="md:col-span-1">
          <Transcript
            transcript={metaData()?.data.transcript ?? []}
            currentTime={currentTime() * 1000}
          />
        </div>
      </div>
    </>
  );
}
