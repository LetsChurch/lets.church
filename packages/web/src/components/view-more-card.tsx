import { IconChevronRight } from '@tabler/icons-react';
import type { LinkProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';

export type Props = {
  text: string;
  to: LinkProps['to'];
};

export function ViewMoreCard({ text, to }: Props) {
  return (
    <Link
      to={to}
      className="border-fancy-pants hover:bg-muted/20 flex aspect-video items-center justify-center rounded-lg bg-zinc-100 transition-colors dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 text-center">
        <span className="text-primary text-sm font-medium">{text}</span>
        <IconChevronRight className="text-muted size-4" />
      </div>
    </Link>
  );
}
