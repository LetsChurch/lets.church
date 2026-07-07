import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/util/cn';

// A Mantine-compatible wrapper around Base UI Tabs so migrated dashboard pages
// keep their `<Tabs value onChange>` / `Tabs.Tab` / `Tabs.Panel` shape while
// rendering in the main app's design language.

type TabsProps = Omit<
  ComponentPropsWithoutRef<typeof BaseTabs.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'onChange' | 'className'
> & {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  className?: string;
  children?: ReactNode;
};

export function Tabs({
  value,
  defaultValue,
  onChange,
  className,
  children,
  ...rest
}: TabsProps) {
  return (
    <BaseTabs.Root
      value={value ?? undefined}
      defaultValue={defaultValue ?? undefined}
      onValueChange={(next) => onChange?.((next as string) ?? null)}
      className={cn('flex flex-col', className)}
      {...rest}
    >
      {children}
    </BaseTabs.Root>
  );
}

function TabsList({
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<typeof BaseTabs.List>, 'className'> & {
  className?: string;
}) {
  return (
    <BaseTabs.List
      className={cn(
        'relative flex items-center gap-1 border-gray-200 border-b dark:border-zinc-800',
        className,
      )}
      {...rest}
    >
      {children}
      <BaseTabs.Indicator
        className="bg-brand absolute bottom-0 h-[2px] rounded-t transition-all duration-200"
        style={{
          left: 'var(--active-tab-left)',
          width: 'var(--active-tab-width)',
        }}
      />
    </BaseTabs.List>
  );
}

type TabProps = Omit<
  ComponentPropsWithoutRef<typeof BaseTabs.Tab>,
  'value' | 'className'
> & {
  value: string;
  className?: string;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
};

function TabsTab({
  value,
  leftSection,
  rightSection,
  className,
  children,
  ...rest
}: TabProps) {
  return (
    <BaseTabs.Tab
      value={value}
      className={cn(
        'flex h-9 items-center gap-2 whitespace-nowrap px-3 font-medium text-secondary text-sm transition-colors hover:text-primary data-[active]:text-primary',
        className,
      )}
      {...rest}
    >
      {leftSection}
      {children}
      {rightSection}
    </BaseTabs.Tab>
  );
}

type PanelProps = Omit<
  ComponentPropsWithoutRef<typeof BaseTabs.Panel>,
  'value' | 'className'
> & {
  value: string;
  className?: string;
};

function TabsPanel({ value, className, ...rest }: PanelProps) {
  const props = rest;
  return <BaseTabs.Panel value={value} className={cn(className)} {...props} />;
}

Tabs.List = TabsList;
Tabs.Tab = TabsTab;
Tabs.Panel = TabsPanel;
