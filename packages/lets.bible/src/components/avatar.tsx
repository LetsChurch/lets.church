import { Avatar as BaseAvatar } from '@base-ui/react/avatar';

export function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0) ?? '';
  if (!first) {
    return '?';
  }
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const last = parts.at(-1) ?? '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function Avatar({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  return (
    <BaseAvatar.Root
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-gold-soft to-gold font-bold text-[12.5px] text-white ${className}`}
    >
      <BaseAvatar.Fallback>{initialsFrom(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
