import { Avatar as BaseAvatar } from '@base-ui-components/react/avatar';
import { cn } from '@/util/cn';

type AvatarProps = {
  src: string | null | undefined;
  alt: string;
  fallbackText: string;
  className?: string;
  fallbackClassName?: string;
};

export function Avatar({
  src,
  alt,
  fallbackText,
  className,
  fallbackClassName,
}: AvatarProps) {
  return (
    <BaseAvatar.Root className={cn('overflow-hidden rounded-full', className)}>
      {src ? <BaseAvatar.Image src={src} alt={alt} /> : null}
      <BaseAvatar.Fallback
        className={cn(
          'flex size-full items-center justify-center bg-brand font-bold text-white',
          fallbackClassName,
        )}
      >
        {fallbackText}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
