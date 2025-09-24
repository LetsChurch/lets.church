import { IconChevronRight } from '@tabler/icons-react';

export type Props = {
  text: string;
  href?: string;
};

export function ViewMoreCard({ text, href = '#' }: Props) {
  return (
    <a
      href={href}
      className="flex aspect-video items-center justify-center rounded-lg border border-top-highlight bg-card transition-colors hover:bg-muted/20"
    >
      <div className="flex items-center gap-2 text-center">
        <span className="font-medium text-primary text-sm">{text}</span>
        <IconChevronRight className="size-4 text-muted" />
      </div>
    </a>
  );
}
