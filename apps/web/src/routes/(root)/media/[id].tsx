import { Title, useParams } from 'solid-start';
import server$ from 'solid-start/server';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import { ParentProps, JSX, splitProps } from 'solid-js';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type {
  SubmitUploadRatingMutation,
  SubmitUploadRatingMutationVariables,
} from './__generated__/[id]';
import { Rating } from '~/__generated__/graphql-types';

function IconCountButton(
  props: ParentProps<{ count: number }> &
    Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class'>,
) {
  const [local, rest] = splitProps(props, ['count']);
  return (
    <button
      type="button"
      class="relative inline-flex items-center space-x-2 border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      {...rest}
    >
      {props.children}
      <span>{local.count}</span>
    </button>
  );
}

export default function MediaRoute() {
  const params = useParams<{ id: string }>();

  // TODO: guard logged in
  const submitRating = server$(
    async (uploadRecordId: string, rating: Rating) => {
      const client = await createAuthenticatedClientOrRedirect(server$.request);

      return client.request<
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
    },
  );

  return (
    <>
      <Title>Media: {params.id} | Let's Church</Title>
      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2 space-y-4">
          <div class="aspect-video w-full bg-gray-100">video</div>
          <h1 class="truncate text-2xl">Media: {params.id}</h1>
          <div class="flex">
            <div>channel</div>
            <span class="isolate ml-auto inline-flex rounded-md shadow-sm [&>*:not(:first-of-type)]:-ml-px [&>*:last-of-type]:rounded-r-md [&>*:first-of-type]:rounded-l-md">
              <IconCountButton
                count={123}
                onClick={() => submitRating(params.id, Rating.Like)}
              >
                <ThumbUpIcon />
              </IconCountButton>
              <IconCountButton
                count={64}
                onClick={() => submitRating(params.id, Rating.Dislike)}
              >
                <ThumbDownIcon class="-scale-x-100" />
              </IconCountButton>
            </span>
          </div>
          <div>comments</div>
        </div>
        <div class="col-span-1 bg-gray-100">sidebar</div>
      </div>
    </>
  );
}
