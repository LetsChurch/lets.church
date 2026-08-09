import type { LinkProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { Text } from '@/components/ui';

type DashboardEntityCardProps = Omit<
  LinkProps,
  'children' | 'className' | 'title'
> & {
  heading: ReactNode;
  description: ReactNode;
  controls: ReactNode;
  truncateHeading?: boolean;
};

export function DashboardEntityCard({
  heading,
  description,
  controls,
  truncateHeading = false,
  ...linkProps
}: DashboardEntityCardProps) {
  return (
    <div className="border-fancy-pants relative overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
        <Link
          {...linkProps}
          className="min-w-0 flex-1 text-inherit no-underline after:absolute after:inset-0 after:block after:content-['']"
        >
          <Text fw={500} truncate={truncateHeading}>
            {heading}
          </Text>
        </Link>
        <div className="relative z-10 flex flex-wrap items-center justify-start gap-2.5">
          {controls}
        </div>
      </div>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </div>
  );
}
