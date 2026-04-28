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
};

export function CommentsSection({
  mediaId,
  lengthSeconds,
  onLoginRequired,
  showContainer = true,
  commentsEnabled = true,
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

    createCommentMutation.mutate({
      mediaId,
      text,
    });
  };

  return (
    <div
      className={cn(
        'relative isolate flex flex-col overflow-hidden',
        showContainer &&
          'mt-6 rounded-2xl border-fancy-pants bg-zinc-100 dark:bg-zinc-900',
      )}
    >
      {/* Comments Header */}
      <div className="flex items-center gap-1 border-zinc-200 border-b px-5 pt-1.5 pb-2 dark:border-zinc-800">
        <span className="font-medium text-primary text-sm">Comments</span>
        <div className="flex h-[18px] min-w-6 items-center justify-center rounded-[9px] bg-gray-950/10 px-1.5 dark:bg-white/10">
          <span className="font-bold text-[10px] text-primary/70 leading-none">
            {comments.length}
          </span>
        </div>
      </div>

      {commentsEnabled ? (
        <>
          {/* Comment Input */}
          <div className="border-zinc-200 border-b p-5 dark:border-zinc-800">
            <CommentInput
              onSubmit={handleSubmitComment}
              placeholder={isLoggedIn ? 'Add a comment' : 'Sign in to comment'}
              disabled={!isLoggedIn}
              isPending={createCommentMutation.isPending}
              errorMessage={errorMessage}
              onErrorDismiss={() => setErrorMessage(null)}
            />
          </div>

          {/* Comments List */}
          <div className="p-5">
            {comments.length === 0 ? (
              <div className="py-8 text-center text-primary/50 text-sm">
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
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center px-5 py-12">
          <IconMessageCircle2
            size={48}
            className="mb-4 text-primary/20"
            strokeWidth={1.5}
          />
          <p className="text-center text-primary/50 text-sm">
            Comments are turned off for this media
          </p>
        </div>
      )}
    </div>
  );
}
