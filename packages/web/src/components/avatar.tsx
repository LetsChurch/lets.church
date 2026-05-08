import { Avatar as BaseAvatar } from '@base-ui-components/react/avatar';
import { cn } from '@/util/cn';
import { getInitials } from '@/util/misc';

type AvatarProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
};

export function Avatar({
  src,
  alt,
  className,
  fallbackClassName,
}: AvatarProps) {
  const initials = getInitials(alt);

  return (
    <BaseAvatar.Root
      className={cn('inline-block overflow-hidden rounded-full', className)}
    >
      {src ? (
        <BaseAvatar.Image
          src={src}
          alt={alt}
          className="block size-full object-cover"
        />
      ) : null}
      <BaseAvatar.Fallback
        className={cn(
          'flex size-full items-center justify-center bg-brand font-bold text-white',
          fallbackClassName,
        )}
      >
        {initials}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
