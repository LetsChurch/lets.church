import { cn } from '@/util/cn';

export type Props = {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
};

export function Avatar({ src, alt, size = 32, className }: Props) {
  return (
    <div
      className={cn(
        'flex-shrink-0 overflow-hidden rounded-full bg-white',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : null}
    </div>
  );
}
