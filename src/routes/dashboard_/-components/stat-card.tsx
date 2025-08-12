import { ActionIcon, Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import classes from './stat-card.module.css';

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  color: 'blue' | 'green' | 'violet';
  tooltip?: string;
}

export function StatCard({
  title,
  value,
  icon,
  color,
  tooltip,
}: StatCardProps) {
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className={clsx(classes.root, classes[color])}
    >
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="xs" className={classes.title}>
            {title}
          </Text>
          {tooltip && (
            <Tooltip label={tooltip} multiline w={200} withinPortal>
              <ActionIcon variant="transparent" size="xs" c={color}>
                <IconInfoCircle size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <div className={classes.icon}>{icon}</div>
      </Group>
      <div className={classes.value} style={{ marginTop: 25 }}>
        {value}
      </div>
    </Paper>
  );
}
