import { createSignal, For, type JSX, Show, ValidComponent } from 'solid-js';
import MessagePlusIcon from '@tabler/icons/message-plus.svg?component-solid';
import { Button } from './form';

export type CommentData = {
  id: string;
  uploadRecordId: string;
  author: {
    username: string;
  };
  text: string;
};

export type Props = {
  data: CommentData;
  replies?: Array<Omit<CommentData, 'replies'>>;
  ReplyForm?: ValidComponent;
  pending?: boolean;
} & Pick<JSX.IntrinsicElements['button'], 'onSubmit'>;

export function CommentForm(props: {
  placeholder: string;
  pending?: boolean;
  onCancel?: () => unknown;
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

  return (
    <>
      <textarea
        name="text"
        class="mt-6 block w-full rounded-md border-0 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:py-1.5 sm:text-sm sm:leading-6"
        rows="5"
        placeholder={props.placeholder}
        onKeyDown={handleKeyDown}
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

export default function Comment(props: Props) {
  const [showReplyForm, setShowReplyForm] = createSignal(false);

  return (
    <div class="mt-6 flex">
      <div class="mr-4 shrink-0">
        <svg
          class="h-16 w-16 border border-gray-300 bg-white text-gray-300"
          preserveAspectRatio="none"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 200 200"
          aria-hidden="true"
        >
          <path
            vector-effect="non-scaling-stroke"
            stroke-width="1"
            d="M0 0l200 200M0 200L200 0"
          />
        </svg>
      </div>
      <div class="grow">
        <h4 class="text-lg font-bold">{props.data.author.username}</h4>
        <p class="mt-1">{props.data.text}</p>
        <For each={props.replies}>{(reply) => <Comment data={reply} />}</For>
        <Show when={props.ReplyForm} keyed>
          {(ReplyForm) => (
            <ReplyForm onSubmit={props.onSubmit}>
              <input
                type="hidden"
                name="uploadRecordId"
                value={props.data.uploadRecordId}
              />
              <input type="hidden" name="replyingTo" value={props.data.id} />
              <Show
                when={showReplyForm()}
                fallback={
                  <button
                    class="relative mt-3 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-50 py-2 px-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
                    onClick={() => setShowReplyForm(true)}
                  >
                    <MessagePlusIcon /> Reply
                  </button>
                }
              >
                <CommentForm
                  pending={props.pending ?? false}
                  placeholder="Add your reply..."
                  onCancel={() => setShowReplyForm(false)}
                />
              </Show>
            </ReplyForm>
          )}
        </Show>
      </div>
    </div>
  );
}
