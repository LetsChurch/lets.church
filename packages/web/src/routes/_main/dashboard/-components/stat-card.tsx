import { IconInfoCircle } from '@tabler/icons-react';
import {
  Link,
  type RegisteredRouter,
  type ValidateLinkOptions,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ActionIcon, Text, Tooltip } from '@/components/ui';
import { cn } from '@/util/cn';

type StatCardColor = 'blue' | 'green' | 'violet';

const COLOR_CLASSES: Record<
  StatCardColor,
  { root: string; icon: string; title: string; value: string }
> = {
  blue: {
    root: 'border-[#74c0fc] bg-[#e7f5ff] dark:border-[rgba(34,139,230,0.35)] dark:bg-[rgba(34,139,230,0.12)]',
    icon: 'text-[#228be6] dark:text-[#4dabf7]',
    title: 'text-[#1971c2] dark:text-[#74c0fc]',
    value: 'text-[#1864ab] dark:text-[#a5d8ff]',
  },
  green: {
    root: 'border-[#8ce99a] bg-[#ebfbee] dark:border-[rgba(64,192,87,0.35)] dark:bg-[rgba(64,192,87,0.12)]',
    icon: 'text-[#40c057] dark:text-[#69db7c]',
    title: 'text-[#2f9e44] dark:text-[#8ce99a]',
    value: 'text-[#2b8a3e] dark:text-[#b2f2bb]',
  },
  violet: {
    root: 'border-[#b197fc] bg-[#f3f0ff] dark:border-[rgba(112,72,232,0.4)] dark:bg-[rgba(112,72,232,0.15)]',
    icon: 'text-[#7048e8] dark:text-[#9775fa]',
    title: 'text-[#5f3dc4] dark:text-[#b197fc]',
    value: 'text-[#4a1fb0] dark:text-[#d0bfff]',
  },
};

type StatCardProps = {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  color: StatCardColor;
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
  const colorClasses = COLOR_CLASSES[color];

  return (
    <div
      className={cn(
        'border-fancy-pants relative rounded-lg border p-4',
        colorClasses.root,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-start gap-2.5">
          <Text
            size="xs"
            className={cn(
              'font-bold uppercase',
              to &&
                "after:absolute after:inset-0 after:block after:content-['']",
              colorClasses.title,
            )}
            {...(to ? { component: Link, to } : {})}
          >
            {title}
          </Text>
          {tooltip && (
            <Tooltip label={tooltip}>
              <ActionIcon
                variant="subtle"
                size="xs"
                color={color}
                className="relative z-20"
              >
                <IconInfoCircle size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        <div className={colorClasses.icon}>{icon}</div>
      </div>
      <div
        className={cn(
          'mt-[25px] text-2xl font-bold leading-none',
          colorClasses.value,
        )}
      >
        {value}
      </div>
    </div>
  );
}
