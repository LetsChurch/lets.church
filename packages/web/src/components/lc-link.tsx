import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from '@/util/cn';

type LcLinkProps = LinkProps & {
  className?: string;
};

export default function LcLink({ className, children, ...props }: LcLinkProps) {
  return (
    <Link
      {...props}
      className={cn(
        'flex h-10 items-center gap-1 rounded-3xl border px-3 transition-all duration-200',
        'focus-within:border-white/0 focus-within:shadow-[0_0_0_2px_--theme(--color-white/0.2),0_0_20px_--theme(--color-white/0.3)]',
        'border-gray-950/10 bg-gray-950/5 dark:border-white/10 dark:bg-white/5',
        'font-semibold text-primary text-sm hover:border-white/20',
        'active:scale-[0.97]',
        className,
      )}
    >
      {children}
    </Link>
  );
}
