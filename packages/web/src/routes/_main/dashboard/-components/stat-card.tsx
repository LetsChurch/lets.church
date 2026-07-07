import { IconInfoCircle } from '@tabler/icons-react';
import {
  Link,
  type RegisteredRouter,
  type ValidateLinkOptions,
} from '@tanstack/react-router';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

import { ActionIcon, Text, Tooltip } from '@/components/ui';
import { cn } from '@/util/cn';

import classes from './stat-card.module.css';

type StatCardProps = {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  color: 'blue' | 'green' | 'violet';
  tooltip?: string;
  to?: ValidateLinkOptions<RegisteredRouter, unknown>['to'];
};

export function StatCard({
  title,
  value,
  icon,
  color,
  tooltip,
  to,
}: StatCardProps) {
  return (
    <div
      className={cn(
        clsx(classes.root, classes[color]),
        'rounded-lg border-fancy-pants bg-white p-4 dark:bg-zinc-900',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-start gap-2.5">
          <Text
            size="xs"
            className={classes.title}
            {...(to ? { component: Link, to } : {})}
          >
            {title}
          </Text>
          {tooltip && (
            <Tooltip label={tooltip}>
              <ActionIcon variant="subtle" size="xs" color={color}>
                <IconInfoCircle size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        <div className={classes.icon}>{icon}</div>
      </div>
      <div className={classes.value} style={{ marginTop: 25 }}>
        {value}
      </div>
    </div>
  );
}
