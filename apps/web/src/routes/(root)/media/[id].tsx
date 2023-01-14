import {
  type RouteDataArgs,
  Title,
  useParams,
  useRouteData,
} from 'solid-start';
import server$, { createServerAction$, redirect } from 'solid-start/server';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import {
  type ParentProps,
  type JSX,
  splitProps,
  useContext,
  createResource,
  untrack,
} from 'solid-js';
import {
  createAuthenticatedClient,
  createAuthenticatedClientOrRedirect,
  gql,
} from '~/util/gql/server';
import { UserContext } from '~/routes/(root)';
import type {
  MediaRouteDataQuery,
  MediaRouteDataQueryVariables,
  SubmitUploadRatingMutation,
  SubmitUploadRatingMutationVariables,
} from './__generated__/[id]';
import { Rating } from '~/__generated__/graphql-types';
import invariant from 'tiny-invariant';

function RatingButton(
  props: ParentProps<{
    count: number;
    value: Rating;
    active: boolean;
  }> &
    Omit<
      JSX.ButtonHTMLAttributes<HTMLButtonElement>,
      'class' | 'onClick' | 'value'
    >,
) {
  const [localProps, restProps] = splitProps(props, [
    'count',
    'value',
    'active',
  ]);

  return (
    <button
      type="submit"
      name="rating"
      value={localProps.value}
      class="relative inline-flex min-w-[80px] items-center space-x-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      classList={{
        'bg-indigo-50': localProps.active,
        'text-indigo-700': localProps.active,
      }}
      {...restProps}
    >
      {props.children}
      <span>{localProps.count}</span>
    </button>
  );
}

export function routeData({ params }: RouteDataArgs) {
  // Use resource rather than createRouteData or createServerData for two reasons:
  //   1. We don't need any of the cache invalidation / automatic data refetching logic for this page.
  //   2. Local mutation is better than refetching for rating data as numbers changing wildly when
  //      clicking like or dislike can appear to be a bug. Resources have this mutation functionality
  //      built in.
  const fetchRouteData = server$(async (id: string) => {
    const client = await createAuthenticatedClient(server$.request);
    invariant(id, "No id provided to routeData for '/media/[id]'");

    const res = await client.request<
      MediaRouteDataQuery,
      MediaRouteDataQueryVariables
    >(
      gql`
        query MediaRouteData($id: ShortUuid!) {
          uploadRecord: uploadRecordById(id: $id) {
            id
            title
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

  return createResource(() => fetchRouteData(id));
}

export default function MediaRoute() {
  const user = useContext(UserContext);
  const params = useParams<{ id: string }>();
  const [data, { mutate: mutateData }] = useRouteData<typeof routeData>();

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
    const uploadRecord = untrack(() => data()?.uploadRecord);

    if (!uploadRecord) {
      return;
    }

    // New rating
    if (!uploadRecord.myRating) {
      return mutateData({
        uploadRecord: {
          ...uploadRecord,
          totalLikes:
            uploadRecord.totalLikes + (newRating === Rating.Like ? 1 : 0),
          totalDislikes:
            uploadRecord.totalDislikes + (newRating === Rating.Dislike ? 1 : 0),
          myRating: newRating,
        },
      });
    }

    // Undo rating
    if (uploadRecord.myRating === newRating) {
      return mutateData({
        uploadRecord: {
          ...uploadRecord,
          totalLikes:
            uploadRecord.totalLikes - (newRating === Rating.Like ? 1 : 0),
          totalDislikes:
            uploadRecord.totalDislikes - (newRating === Rating.Dislike ? 1 : 0),
          myRating: null,
        },
      });
    }

    // Change rating
    return mutateData({
      uploadRecord: {
        ...uploadRecord,
        totalLikes:
          uploadRecord.totalLikes + (newRating === Rating.Like ? 1 : -1),
        totalDislikes:
          uploadRecord.totalDislikes + (newRating === Rating.Dislike ? 1 : -1),
        myRating: newRating,
      },
    });
  }

  return (
    <>
      <Title>Media: {params.id} | Let's Church</Title>
      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2 space-y-4">
          <div class="aspect-video w-full bg-gray-100">video</div>
          <h1 class="truncate text-2xl">Media: {params.id}</h1>
          <div class="flex">
            <div>channel</div>
            <submitRating.Form
              class="isolate ml-auto inline-flex rounded-md shadow-sm [&>*:not(:first-of-type)]:-ml-px [&>*:last-of-type]:rounded-r-md [&>*:first-of-type]:rounded-l-md"
              replace
              onSubmit={(e) => {
                if (!user?.()?.me) {
                  e.preventDefault();
                  alert('Not logged in!');
                  // TODO: show login
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
                count={data()?.uploadRecord.totalLikes ?? 0}
                value={Rating.Like}
                active={data()?.uploadRecord.myRating === Rating.Like}
                disabled={submittingRating.pending}
              >
                <ThumbUpIcon class="pointer-events-none" />
              </RatingButton>
              <RatingButton
                count={data()?.uploadRecord.totalDislikes ?? 0}
                value={Rating.Dislike}
                active={data()?.uploadRecord.myRating === Rating.Dislike}
                disabled={submittingRating.pending}
              >
                <ThumbDownIcon class="pointer-events-none -scale-x-100" />
              </RatingButton>
            </submitRating.Form>
          </div>
          <div>comments</div>
        </div>
        <div class="col-span-1 bg-gray-100">sidebar</div>
      </div>
    </>
  );
}
