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
        'rounded-full border-top-highlight bg-white/15 px-3 py-1.5 font-semibold text-sm text-white/80',
        className,
      )}
    >
      {children}
    </Link>
  );
}
