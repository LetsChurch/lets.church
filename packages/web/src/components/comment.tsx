import { IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Avatar } from '@/components/avatar';
import { CommentInput } from '@/components/comment-input';
import { useIsLoggedIn } from '@/hooks/use-is-logged-in';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import LcButton from './lc-button';

type CommentProps = {
  comment: {
    id: string;
    text: string;
    createdAt: Date;
    author: {
      id: string;
      username: string;
      fullName: string | null;
      avatarPath: string | null;
    };
    likeCount: number;
    replyCount?: number;
    userRating: 'LIKE' | 'DISLIKE' | null;
  };
  mediaId: string;
  onLoginRequired: () => void;
  isReply?: boolean;
};

export function Comment({
  comment,
  mediaId,
  onLoginRequired,
  isReply = false,
}: CommentProps) {
  const isLoggedIn = useIsLoggedIn();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const { data: replies } = useQuery({
    ...trpc.media.getReplies.queryOptions({ commentId: comment.id }),
    enabled: showReplies && !isReply,
  });

  const rateCommentMutation = useMutation({
    mutationFn: trpc.media.rateComment.mutationOptions().mutationFn,
    onMutate: async (variables) => {
      // Only perform optimistic update if user is logged in
      if (!isLoggedIn) {
        return { previousComments: undefined };
      }

      const queryKey = trpc.media.getComments.queryKey({
        mediaId,
      });

      await queryClient.cancelQueries({ queryKey });
      const previousComments = queryClient.getQueryData(queryKey);

      type CommentData = CommentProps['comment'];

      // Optimistically update the cache
      queryClient.setQueriesData(
        { queryKey },
        (old: CommentData[] | undefined) => {
          if (!old) return old;
          return old.map((c) => {
            if (c.id !== comment.id) return c;

            const result = { ...c };
            if (c.userRating === variables.rating) {
              result.likeCount = Math.max(0, c.likeCount - 1);
              result.userRating = null;
            } else if (c.userRating === null) {
              if (variables.rating === 'LIKE') {
                result.likeCount = c.likeCount + 1;
              }
              result.userRating = variables.rating;
            } else {
              if (c.userRating === 'LIKE') {
                result.likeCount = Math.max(0, c.likeCount - 1);
              }
              if (variables.rating === 'LIKE') {
                result.likeCount = c.likeCount + 1;
              }
              result.userRating = variables.rating;
            }
            return result;
          });
        },
      );

      return { previousComments };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousComments) {
        queryClient.setQueryData(
          trpc.media.getComments.queryKey({ mediaId }),
          context.previousComments,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.media.getComments.queryKey({ mediaId }),
      });
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: trpc.media.createComment.mutationOptions().mutationFn,
    onSuccess: () => {
      setShowReplyInput(false);
      queryClient.invalidateQueries({
        queryKey: trpc.media.getComments.queryKey({ mediaId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.media.getReplies.queryKey({ commentId: comment.id }),
      });
      // Auto-show replies after posting
      setShowReplies(true);
    },
  });

  const handleRate = (rating: 'LIKE' | 'DISLIKE') => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }

    rateCommentMutation.mutate({
      commentId: comment.id,
      rating,
    });
  };

  const handleReplyClick = () => {
    if (!isLoggedIn) {
      onLoginRequired();
      return;
    }
    setShowReplyInput(!showReplyInput);
  };

  const handleSubmitReply = (text: string) => {
    createReplyMutation.mutate({
      mediaId,
      text,
      replyingToId: comment.id,
    });
  };

  const avatarUrl = comment.author.avatarPath
    ? `/api/media/${comment.author.avatarPath}`
    : null;

  const timeAgo = new Date(comment.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex gap-3">
      <Avatar
        src={avatarUrl}
        alt={comment.author.username}
        fallbackText={comment.author.username.charAt(0).toUpperCase()}
        className="size-8 flex-shrink-0"
        fallbackClassName="text-xs"
      />

      <div className="flex-1 overflow-hidden">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="font-medium text-primary text-sm">
            {comment.author.fullName || `@${comment.author.username}`}
          </span>
          <span className="text-primary/50 text-xs">{timeAgo}</span>
        </div>

        <p className="mb-2 whitespace-pre-wrap break-words text-primary/90 text-sm leading-relaxed">
          {comment.text}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleRate('LIKE')}
            className={cn(
              'flex min-w-12 items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-white/5',
              comment.userRating === 'LIKE' && 'bg-white/10',
            )}
          >
            <IconThumbUp size={14} className="text-primary/70" />
            <span className="text-primary/70 text-xs">{comment.likeCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleRate('DISLIKE')}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-white/5',
              comment.userRating === 'DISLIKE' && 'bg-white/10',
            )}
          >
            <IconThumbDown size={14} className="text-primary/70" />
          </button>

          {!isReply ? (
            <button
              type="button"
              onClick={handleReplyClick}
              className="rounded-lg px-2 py-1 text-primary/70 text-xs transition-colors hover:bg-white/10"
            >
              Reply
            </button>
          ) : null}

          {comment.replyCount && comment.replyCount > 0 && !isReply ? (
            <button
              type="button"
              onClick={() => setShowReplies(!showReplies)}
              className="rounded-lg px-2 py-1 text-indigo-400 text-xs transition-colors hover:bg-white/10"
            >
              {showReplies ? 'Hide' : 'View'} {comment.replyCount}{' '}
              {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          ) : null}
        </div>

        {showReplyInput ? (
          <div className="mt-4">
            <CommentInput
              onSubmit={handleSubmitReply}
              placeholder="Write a reply..."
              isPending={createReplyMutation.isPending}
            />
            <div className="mt-2 flex justify-end">
              <LcButton onClick={() => setShowReplyInput(false)}>
                Cancel
              </LcButton>
            </div>
          </div>
        ) : null}

        {showReplies && replies ? (
          <div className="mt-4 space-y-4">
            {replies.map((reply: CommentProps['comment']) => (
              <Comment
                key={reply.id}
                comment={reply}
                mediaId={mediaId}
                onLoginRequired={onLoginRequired}
                isReply
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
