import type { ReactNode } from 'react';

type TagSize = 'sm' | 'md';

type TagColor =
  | 'BLUE'
  | 'GREEN'
  | 'RED'
  | 'INDIGO'
  | 'PINK'
  | 'PURPLE'
  | 'GRAY';

export type TagProps = {
  children: ReactNode;
  size?: TagSize;
  color?: TagColor;
  className?: string;
};

function getTagColorClass(color: TagColor): string {
  switch (color) {
    case 'BLUE':
      return 'bg-blue-500/10';
    case 'GREEN':
      return 'bg-green-500/10';
    case 'RED':
      return 'bg-red-500/10';
    case 'INDIGO':
      return 'bg-indigo-500/10';
    case 'PINK':
      return 'bg-pink-500/10';
    case 'PURPLE':
      return 'bg-purple-500/10';
    case 'GRAY':
      return 'bg-gray-500/10';
    default:
      return 'bg-gray-500/10';
  }
}

export function Tag({
  children,
  size = 'md',
  color = 'GRAY',
  className = '',
}: TagProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border-fancy-pants font-semibold text-primary/80 uppercase tracking-wide ${getTagColorClass(color)} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}
