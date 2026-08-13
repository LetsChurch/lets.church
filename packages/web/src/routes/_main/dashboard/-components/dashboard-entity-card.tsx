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
    <div className="dashboard-card" data-interactive="true">
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
        <Link
          {...linkProps}
          className="focus-visible:ring-brand/40 min-w-0 flex-1 rounded-md text-inherit no-underline outline-none after:absolute after:inset-0 after:block after:content-[''] focus-visible:ring-2"
        >
          <Text
            fw={600}
            truncate={truncateHeading}
            className="text-dashboard-ink"
          >
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
