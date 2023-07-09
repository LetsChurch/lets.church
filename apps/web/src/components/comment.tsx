import {
  createSignal,
  For,
  type JSX,
  Show,
  ValidComponent,
  onMount,
  untrack,
} from 'solid-js';
import MessagePlusIcon from '@tabler/icons/message-plus.svg?component-solid';
import ThumbUpIcon from '@tabler/icons/thumb-up.svg?component-solid';
import ThumbDownIcon from '@tabler/icons/thumb-down.svg?component-solid';
import { Dynamic } from 'solid-js/web';
import { Button } from './form';
import { Avatar } from './avatar';
import { Rating } from '~/__generated__/graphql-types';
import { useUser } from '~/util/user-context';

export type CommentData = {
  id: string;
  uploadRecordId: string;
  author: {
    username: string;
    avatarUrl?: string | null;
  };
  text: string;
  totalLikes: number;
  totalDislikes: number;
  myRating?: Rating | null;
};

export type Props = {
  data: CommentData;
  replies?: Array<Omit<CommentData, 'replies'>>;
  ReplyForm?: ValidComponent;
  RateForm: ValidComponent;
  pending?: boolean;
} & Pick<JSX.IntrinsicElements['button'], 'onSubmit'>;

export function CommentForm(props: {
  placeholder: string;
  pending?: boolean;
  onCancel?: () => unknown;
  autofocus?: boolean;
}) {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.target instanceof HTMLTextAreaElement) {
        const submitButton = e.target.form?.querySelector(
          'button[type="submit"]',
        );
        // Use button click instead of form submit in order to trigger solid-start progressive enhancement
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.click();
        }
      }
    }
  }

  let ref: HTMLTextAreaElement;

  onMount(() => {
    if (ref && props.autofocus) {
      ref.focus();
      ref.scrollIntoView();
    }
  });

  return (
    <>
      <textarea
        name="text"
        class="mt-6 block w-full scroll-mt-24 rounded-md border-0 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:py-1.5 sm:text-sm sm:leading-6"
        rows="5"
        placeholder={props.placeholder}
        onKeyDown={handleKeyDown}
        ref={(el) => void (ref = el)}
      />
      <div class="mt-2 flex justify-end gap-1">
        <Show when={props.onCancel} keyed>
          {(onCancel) => (
            <Button
              disabled={props.pending ?? false}
              onClick={onCancel}
              variant="secondary"
            >
              Cancel
            </Button>
          )}
        </Show>
        <Button type="submit" disabled={props.pending ?? false}>
          Post
        </Button>
      </div>
    </>
  );
}

function CommentActionButton(
  props: { active?: boolean } & Omit<JSX.IntrinsicElements['button'], 'class'>,
) {
  return (
    <button
      class={`relative mt-3 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-50 px-3 py-2 text-sm font-medium hover:bg-gray-100 ${
        props.active ? 'text-indigo-700' : 'text-gray-500'
      }`}
      {...props}
    />
  );
}

export default function Comment(props: Props) {
  const user = useUser();
  const [ratingState, setRatingState] = createSignal(
    untrack(() => ({
      totalLikes: props.data.totalLikes,
      totalDislikes: props.data.totalDislikes,
      myRating: props.data.myRating,
    })),
  );
  const [showReplyForm, setShowReplyForm] = createSignal(false);

  function handleRating(newRating: Rating) {
    // New rating
    if (!ratingState().myRating) {
      return setRatingState({
        ...ratingState(),
        totalLikes:
          ratingState().totalLikes + (newRating === Rating.Like ? 1 : 0),
        totalDislikes:
          ratingState().totalDislikes + (newRating === Rating.Dislike ? 1 : 0),
        myRating: newRating,
      });
    }

    // Undo rating
    if (ratingState().myRating === newRating) {
      return setRatingState({
        ...ratingState(),
        totalLikes:
          ratingState().totalLikes - (newRating === Rating.Like ? 1 : 0),
        totalDislikes:
          ratingState().totalDislikes - (newRating === Rating.Dislike ? 1 : 0),
        myRating: null,
      });
    }

    // Change rating
    return setRatingState({
      ...ratingState(),
      totalLikes:
        ratingState().totalLikes + (newRating === Rating.Like ? 1 : -1),
      totalDislikes:
        ratingState().totalDislikes + (newRating === Rating.Dislike ? 1 : -1),
      myRating: newRating,
    });
  }

  return (
    <div class="mt-6 flex">
      <div class="mr-4 shrink-0">
        <Avatar src={props.data.author.avatarUrl ?? ''} size="md" />
      </div>
      <div class="grow">
        <h4 class="text-lg font-bold">{props.data.author.username}</h4>
        <p class="mt-1">{props.data.text}</p>
        <div class="flex gap-2">
          <Dynamic
            component={props.RateForm}
            class="contents"
            // eslint-disable-next-line solid/reactivity
            onSubmit={(e: SubmitEvent) => {
              if (!user) {
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
            <input
              type="hidden"
              name="uploadRecordId"
              value={props.data.uploadRecordId}
            />
            <input
              type="hidden"
              name="uploadUserCommentId"
              value={props.data.id}
            />
            <CommentActionButton
              type="submit"
              name="rating"
              value={Rating.Like}
              active={ratingState().myRating === Rating.Like}
            >
              <ThumbUpIcon class="scale-90" />{' '}
              <span>{ratingState().totalLikes}</span>
            </CommentActionButton>
            <CommentActionButton
              type="submit"
              name="rating"
              value={Rating.Dislike}
              active={ratingState().myRating === Rating.Dislike}
            >
              <ThumbDownIcon class="-scale-x-90 scale-y-90" />{' '}
              <span>{ratingState().totalDislikes}</span>
            </CommentActionButton>
          </Dynamic>
          <Show when={props.ReplyForm}>
            <CommentActionButton
              onClick={() => setShowReplyForm((value) => !value)}
            >
              <MessagePlusIcon class="scale-90" /> Reply
            </CommentActionButton>
          </Show>
        </div>
        <For each={props.replies}>
          {(reply) => <Comment data={reply} RateForm={props.RateForm} />}
        </For>
        <Show when={props.ReplyForm} keyed>
          {(ReplyForm) => (
            <ReplyForm onSubmit={props.onSubmit}>
              <input
                type="hidden"
                name="uploadRecordId"
                value={props.data.uploadRecordId}
              />
              <input type="hidden" name="replyingTo" value={props.data.id} />
              <Show when={showReplyForm()}>
                <CommentForm
                  pending={props.pending ?? false}
                  placeholder="Add your reply..."
                  onCancel={() => setShowReplyForm(false)}
                  autofocus
                />
              </Show>
            </ReplyForm>
          )}
        </Show>
      </div>
    </div>
  );
}
