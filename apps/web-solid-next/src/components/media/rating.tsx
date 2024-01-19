import { gql } from 'graphql-request';
import {
  createEffect,
  createResource,
  type JSX,
  untrack,
  splitProps,
  Switch,
  Match,
} from 'solid-js';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import invariant from 'tiny-invariant';
import { action, redirect, useSubmission } from '@solidjs/router';
import type {
  MediaRouteRatingStateQuery,
  MediaRouteRatingStateQueryVariables,
  SubmitUploadRatingMutation,
  SubmitUploadRatingMutationVariables,
} from './__generated__/rating';
import UnderbarButton from './underbar-button';
import {
  getAuthenticatedClient,
  getAuthenticatedClientOrRedirect,
} from '~/util/gql/server';
import type { Optional } from '~/util';
import { useUser } from '~/util/user-context';
import { Rating } from '~/__generated__/graphql-types';

// Use resource rather than createRouteData or createServerData for the rating state. We don't
// want any of the cache invalidation / automatic data refetching logic for rating. Local mutation
// is better than refetching for rating data as numbers changing wildly when clicking like or dislike
// can appear to be a bug. Resources have this mutation functionality built in.
const fetchRatingState = async (id: string) => {
  'use server';
  const client = await getAuthenticatedClient();

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
};

const submitRating = action(async (form: FormData) => {
  'use server';
  const uploadRecordId = form.get('uploadRecordId');
  const rating = form.get('rating') === 'LIKE' ? Rating.Like : Rating.Dislike;
  invariant(
    typeof uploadRecordId === 'string',
    'No uploadRecordId provided to submitRating',
  );

  const client = await getAuthenticatedClientOrRedirect();

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

  throw redirect(`/media/${uploadRecordId}`);
});

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

export default function RatingButtons(props: { id: string }) {
  const [
    ratingStateData,
    { mutate: mutateRating, refetch: refetchRatingState },
  ] = createResource(() => fetchRatingState(props.id));

  let prevMe: Optional<{ id: string }> = null;

  const user = useUser();

  // Refetch rating state when user logs in or out
  createEffect(() => {
    const next = user();

    if (prevMe?.id !== next?.id) {
      refetchRatingState();
    }

    prevMe = next;
  });

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

  const submission = useSubmission(submitRating);

  return (
    <form
      class="isolate inline-flex rounded-md shadow-sm"
      // TODO: port
      // replace
      onSubmit={(e) => {
        if (!user()) {
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
      <input type="hidden" name="uploadRecordId" value={props.id} />
      <RatingButton
        count={ratingStateData()?.data.totalLikes ?? 0}
        value={Rating.Like}
        active={ratingStateData()?.data.myRating === Rating.Like}
        disabled={submission.pending}
      />
      <RatingButton
        count={ratingStateData()?.data.totalDislikes ?? 0}
        value={Rating.Dislike}
        active={ratingStateData()?.data.myRating === Rating.Dislike}
        disabled={submission.pending}
      />
    </form>
  );
}
