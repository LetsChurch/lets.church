import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/util/cn';

type TableProps = ComponentPropsWithoutRef<'table'> & {
  highlightOnHover?: boolean;
  striped?: boolean;
  withTableBorder?: boolean;
  withRowBorders?: boolean;
};

export function Table({
  highlightOnHover,
  striped,
  withTableBorder = true,
  withRowBorders = true,
  className,
  children,
  ...rest
}: TableProps) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto',
        withTableBorder &&
          'rounded-xl border border-dashboard-rule bg-dashboard-surface',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-left text-sm',
          highlightOnHover && '[&_tbody_tr:hover]:bg-dashboard-accent-soft/55',
          striped && '[&_tbody_tr:nth-child(odd)]:bg-dashboard-canvas/70',
          withRowBorders &&
            '[&_tbody_tr]:border-dashboard-rule [&_tbody_tr]:border-t',
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

function Thead({ className, ...rest }: ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead
      className={cn(
        'border-dashboard-rule border-b bg-dashboard-raised',
        className,
      )}
      {...rest}
    />
  );
}

function Tbody(props: ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props} />;
}

function Tfoot({ className, ...rest }: ComponentPropsWithoutRef<'tfoot'>) {
  return (
    <tfoot
      className={cn(
        'border-dashboard-rule border-t bg-dashboard-raised',
        className,
      )}
      {...rest}
    />
  );
}

function Tr({ className, ...rest }: ComponentPropsWithoutRef<'tr'>) {
  return <tr className={className} {...rest} />;
}

function Th({ className, ...rest }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 font-mono font-semibold text-[0.68rem] text-secondary uppercase tracking-[0.09em]',
        className,
      )}
      {...rest}
    />
  );
}

function Td({ className, ...rest }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      className={cn('px-4 py-3 align-middle text-primary', className)}
      {...rest}
    />
  );
}

function Caption({ className, ...rest }: ComponentPropsWithoutRef<'caption'>) {
  return (
    <caption
      className={cn('mt-2 text-secondary text-xs', className)}
      {...rest}
    />
  );
}

type ScrollContainerProps = ComponentPropsWithoutRef<'div'> & {
  minWidth?: number | string;
};

function ScrollContainer({
  minWidth,
  className,
  children,
  style,
  ...rest
}: ScrollContainerProps) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} {...rest}>
      <div style={{ minWidth, ...style }}>{children}</div>
    </div>
  );
}

Table.Thead = Thead;
Table.Tbody = Tbody;
Table.Tfoot = Tfoot;
Table.Tr = Tr;
Table.Th = Th;
Table.Td = Td;
Table.Caption = Caption;
Table.ScrollContainer = ScrollContainer;
