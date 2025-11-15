import { IconArrowUpRight } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { cn } from '@/util/cn';

type CommentInputProps = {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isPending?: boolean;
  errorMessage?: string | null;
  onErrorDismiss?: () => void;
};

export function CommentInput({
  onSubmit,
  placeholder = 'Add a comment',
  disabled = false,
  isPending = false,
  errorMessage,
  onErrorDismiss,
}: CommentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = errorMessage ?? localError;

  const handleSubmit = () => {
    const commentText = textareaRef.current?.value ?? '';
    if (!commentText.trim()) {
      setLocalError('Comment cannot be empty');
      return;
    }

    onSubmit(commentText);

    // Clear the textarea after successful submission
    if (textareaRef.current) {
      textareaRef.current.value = '';
    }
    setLocalError(null);
  };

  const handleChange = () => {
    if (displayError) {
      setLocalError(null);
      onErrorDismiss?.();
    }
  };

  return (
    <div>
      <div
        className={cn(
          'relative flex items-start gap-1 rounded-[24px] border border-gray-950/10 bg-gray-950/5 pr-2 pl-3 dark:border-white/10 dark:bg-white/5',
        )}
      >
        <textarea
          ref={textareaRef}
          onChange={handleChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'field-sizing-content flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-2 text-primary text-sm placeholder-gray-500 outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder-zinc-400',
          )}
          rows={1}
        />
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isPending || disabled}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full backdrop-blur-sm transition-all hover:bg-[rgba(9,9,11,0.1)] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send comment"
        >
          <IconArrowUpRight
            size={24}
            className="text-primary opacity-50"
            strokeWidth={1.5}
          />
        </button>
      </div>
      {displayError ? (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-400 text-sm">
          {displayError}
        </div>
      ) : null}
    </div>
  );
}
