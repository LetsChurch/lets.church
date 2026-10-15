import { IconMessageCircle2 } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { Comment } from '@/components/comment';
import { CommentInput } from '@/components/comment-input';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

export type CommentsSectionProps = {
  mediaId: string;
  lengthSeconds?: number | null;
  onLoginRequired: () => void;
  /**
   * Whether to show the container styling (rounded borders, margin, etc.)
   * Set to false when used in a mobile drawer
   */
  showContainer?: boolean;
  /**
   * Whether comments are enabled for this media
   */
  commentsEnabled?: boolean;
  canParticipate?: boolean;
  onParticipationRequired: () => void;
};

export function CommentsSection({
  mediaId,
  lengthSeconds,
  onLoginRequired,
  showContainer = true,
  commentsEnabled = true,
  canParticipate = false,
  onParticipationRequired,
}: CommentsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isLoggedIn = useIsLoggedIn();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: comments } = useSuspenseQuery(
    trpc.media.getComments.queryOptions({
      mediaId,
    }),
  );

  const createCommentMutation = useMutation({
    mutationFn: trpc.media.createComment.mutationOptions().mutationFn,
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({
        queryKey: trpc.media.getComments.queryKey({
          mediaId,
        }),
      });
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  const handleSubmitComment = (text: string) => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }
    if (!canParticipate) {
      onParticipationRequired();
      return;
    }

    createCommentMutation.mutate({
      mediaId,
      text,
    });
  };

  return (
    <div
      className={cn(
        // overflow-clip (not hidden) so the composer below can stick to the
        // viewport/drawer scroller instead of this box.
        'relative isolate flex flex-col overflow-clip',
        showContainer &&
          'mt-6 rounded-2xl border-fancy-pants bg-zinc-100 dark:bg-zinc-900',
      )}
    >
      {/* Comments Header */}
      <div className="flex items-center gap-1 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <span className="text-primary text-sm font-medium">Comments</span>
        {comments.length > 0 ? (
          <div className="flex h-[18px] min-w-6 items-center justify-center rounded-[9px] bg-gray-950/10 px-1.5 dark:bg-white/10">
            <span className="text-primary/70 text-[10px] leading-none font-bold">
              {comments.length}
            </span>
          </div>
        ) : null}
      </div>

      {commentsEnabled ? (
        <>
          {/* Comments List */}
          <div className="px-5 pt-5">
            {comments.length === 0 ? (
              <div className="text-primary/50 py-8 text-center text-sm">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <div className="space-y-6">
                {comments.map((comment) => (
                  <Comment
                    key={comment.id}
                    comment={comment}
                    mediaId={mediaId}
                    lengthSeconds={lengthSeconds}
                    onLoginRequired={onLoginRequired}
                    canParticipate={canParticipate}
                    onParticipationRequired={onParticipationRequired}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Comment Input — pinned to the bottom of the scroller while the
              list scrolls past, so it's always reachable. */}
          <div
            className={cn(
              'sticky bottom-0 z-10 p-5',
              showContainer
                ? 'bg-zinc-100 dark:bg-zinc-900'
                : 'bg-white dark:bg-zinc-900',
            )}
          >
            <CommentInput
              onSubmit={handleSubmitComment}
              placeholder={
                !isLoggedIn
                  ? 'Sign in to comment'
                  : canParticipate
                    ? 'Add a comment'
                    : 'Accept the participation policies to comment'
              }
              disabled={!isLoggedIn || !canParticipate}
              isPending={createCommentMutation.isPending}
              errorMessage={errorMessage}
              onErrorDismiss={() => setErrorMessage(null)}
            />
            {isLoggedIn && !canParticipate ? (
              <button
                type="button"
                className="text-brand mt-3 text-sm font-medium underline underline-offset-2"
                onClick={onParticipationRequired}
              >
                Review participation policies
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center px-5 py-12">
          <IconMessageCircle2
            size={48}
            className="text-primary/20 mb-4"
            strokeWidth={1.5}
          />
          <p className="text-primary/50 text-center text-sm">
            Comments are turned off for this media
          </p>
        </div>
      )}
    </div>
  );
}
