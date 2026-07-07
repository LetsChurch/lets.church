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
  withTableBorder,
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
          'rounded-lg border border-gray-200 dark:border-zinc-800',
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-left text-sm',
          highlightOnHover &&
            '[&_tbody_tr:hover]:bg-gray-50 dark:[&_tbody_tr:hover]:bg-white/5',
          striped &&
            '[&_tbody_tr:nth-child(odd)]:bg-gray-50 dark:[&_tbody_tr:nth-child(odd)]:bg-white/5',
          withRowBorders &&
            '[&_tbody_tr]:border-gray-100 [&_tbody_tr]:border-t dark:[&_tbody_tr]:border-zinc-800',
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
      className={cn('border-gray-200 border-b dark:border-zinc-800', className)}
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
      className={cn('border-gray-200 border-t dark:border-zinc-800', className)}
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
        'px-3 py-2 font-medium text-secondary text-xs uppercase tracking-wide',
        className,
      )}
      {...rest}
    />
  );
}

function Td({ className, ...rest }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      className={cn('px-3 py-2 align-middle text-primary', className)}
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
