import { IconMessageCircle2 } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import { Comment } from '@/components/comment';
import LcButton from '@/components/lc-button';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

export type CommentsSectionProps = {
  mediaId: string;
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
  onLoginRequired,
  showContainer = true,
  commentsEnabled = true,
}: CommentsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isLoggedIn = useIsLoggedIn();
  const [commentText, setCommentText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: comments } = useSuspenseQuery(
    trpc.media.getComments.queryOptions({
      mediaId,
    }),
  );

  const createCommentMutation = useMutation({
    mutationFn: trpc.media.createComment.mutationOptions().mutationFn,
    onSuccess: () => {
      setCommentText('');
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

  const handleSubmitComment = () => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }

    if (!commentText.trim()) return;

    createCommentMutation.mutate({
      mediaId,
      text: commentText,
    });
  };

  return (
    <div
      className={cn(
        'relative isolate flex flex-col overflow-hidden',
        showContainer && 'mt-6 rounded-2xl border-top-highlight bg-zinc-900',
      )}
    >
      {/* Comments Header */}
      <div className="flex items-center gap-1 border-zinc-800 border-b px-5 pt-1.5 pb-2">
        <span className="font-medium text-sm text-white">Comments</span>
        <div className="flex h-[18px] items-center justify-center rounded-[9px] bg-white/10 px-1.5">
          <span className="font-bold text-[10px] text-white/70 leading-none">
            {comments.length}
          </span>
        </div>
      </div>

      {commentsEnabled ? (
        <>
          {/* Comment Input */}
          <div className="border-zinc-800 border-b p-5">
            <div className="flex gap-3">
              <textarea
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                placeholder={
                  isLoggedIn ? 'Add a comment...' : 'Sign in to comment'
                }
                disabled={!isLoggedIn}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/50 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
              />
            </div>
            {errorMessage ? (
              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-400 text-sm">
                {errorMessage}
              </div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <LcButton
                onClick={handleSubmitComment}
                disabled={
                  !commentText.trim() || createCommentMutation.isPending
                }
                className="bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createCommentMutation.isPending ? 'Posting...' : 'Comment'}
              </LcButton>
            </div>
          </div>

          {/* Comments List */}
          <div className="p-5">
            {comments.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/50">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <div className="space-y-6">
                {comments.map((comment) => (
                  <Comment
                    key={comment.id}
                    comment={comment}
                    mediaId={mediaId}
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
            className="mb-4 text-white/20"
            strokeWidth={1.5}
          />
          <p className="text-center text-sm text-white/50">
            Comments are turned off for this video
          </p>
        </div>
      )}
    </div>
  );
}
