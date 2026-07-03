import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/util/cn';

type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const FONT_SIZE: Record<FontSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

// Text color tokens. `dimmed` maps to the main app's secondary text token; the
// named colors match the palette used elsewhere in the dashboard.
const TEXT_COLOR: Record<string, string> = {
  dimmed: 'text-secondary',
  muted: 'text-muted',
  red: 'text-red-600 dark:text-red-400',
  green: 'text-green-600 dark:text-green-400',
  blue: 'text-blue-600 dark:text-blue-400',
  orange: 'text-orange-600 dark:text-orange-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  teal: 'text-teal-600 dark:text-teal-400',
  purple: 'text-purple-600 dark:text-purple-400',
  brand: 'text-brand',
  lc: 'text-brand',
};

const FONT_WEIGHT: Record<number, string> = {
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
};

const TEXT_ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

// --- Text ------------------------------------------------------------------

type TextProps = Omit<ComponentPropsWithoutRef<'p'>, 'color'> & {
  component?: ElementType;
  size?: FontSize;
  c?: string;
  fw?: number;
  ta?: 'left' | 'center' | 'right';
  truncate?: boolean;
  lineClamp?: number;
  span?: boolean;
  // Passthrough for when `component` renders an anchor or router Link.
  href?: string;
  target?: string;
  rel?: string;
  download?: unknown;
  to?: unknown;
  params?: unknown;
  search?: unknown;
};

export function Text({
  component,
  size,
  c,
  fw,
  ta,
  truncate,
  lineClamp,
  span,
  className,
  style,
  ...rest
}: TextProps) {
  const props = rest;
  const Component = component ?? (span ? 'span' : 'p');
  // Default to the adaptive primary token (like Mantine's themed Text) so text
  // stays legible in dark mode; `c="inherit"` opts out to inherit the parent.
  const colorClass = c
    ? c === 'inherit'
      ? undefined
      : TEXT_COLOR[c]
    : 'text-primary';
  // Inline color only when it isn't one of our tokens (e.g. a raw CSS color).
  const inlineColor = c && c !== 'inherit' && !TEXT_COLOR[c] ? c : undefined;
  const computedStyle =
    lineClamp || inlineColor
      ? {
          ...(lineClamp
            ? {
                display: '-webkit-box',
                WebkitLineClamp: lineClamp,
                WebkitBoxOrient: 'vertical' as const,
              }
            : {}),
          ...(inlineColor ? { color: inlineColor } : {}),
          ...style,
        }
      : style;
  return (
    <Component
      className={cn(
        size && FONT_SIZE[size],
        colorClass,
        fw && FONT_WEIGHT[fw],
        ta && TEXT_ALIGN[ta],
        truncate && 'truncate',
        lineClamp && 'overflow-hidden',
        className,
      )}
      style={computedStyle}
      {...props}
    />
  );
}

// --- Title -----------------------------------------------------------------

type TitleProps = Omit<ComponentPropsWithoutRef<'h1'>, 'color'> & {
  order?: 1 | 2 | 3 | 4 | 5 | 6;
  c?: string;
  ta?: 'left' | 'center' | 'right';
};

const TITLE_SIZE: Record<number, string> = {
  1: 'text-3xl font-bold',
  2: 'text-2xl font-bold',
  3: 'text-xl font-semibold',
  4: 'text-lg font-semibold',
  5: 'text-base font-semibold',
  6: 'text-sm font-semibold',
};

export function Title({ order = 1, c, ta, className, ...rest }: TitleProps) {
  const props = rest;
  const Component = `h${order}` as ElementType;
  return (
    <Component
      className={cn(
        'text-primary',
        TITLE_SIZE[order],
        c && TEXT_COLOR[c],
        ta && TEXT_ALIGN[ta],
        className,
      )}
      {...props}
    />
  );
}

// --- Anchor ----------------------------------------------------------------

type AnchorProps = ComponentPropsWithoutRef<'a'> & {
  component?: ElementType;
  underline?: 'always' | 'hover' | 'never';
  c?: string;
  fw?: number;
  size?: FontSize;
  [key: string]: unknown;
};

export function Anchor({
  component,
  underline = 'hover',
  c,
  fw,
  size,
  className,
  ...rest
}: AnchorProps) {
  const props = rest;
  const Component = component ?? 'a';
  return (
    <Component
      className={cn(
        c ? TEXT_COLOR[c] : 'text-brand',
        underline === 'always' && 'underline',
        underline === 'hover' && 'hover:underline',
        fw && FONT_WEIGHT[fw],
        size && FONT_SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

// --- List ------------------------------------------------------------------

type ListProps = Omit<ComponentPropsWithoutRef<'ul'>, 'color'> & {
  size?: FontSize;
  type?: 'ordered' | 'unordered';
  withPadding?: boolean;
  icon?: ReactNode;
  spacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

const LIST_SPACING: Record<string, string> = {
  xs: 'space-y-1',
  sm: 'space-y-1.5',
  md: 'space-y-2',
  lg: 'space-y-3',
  xl: 'space-y-4',
};

export function List({
  size,
  type = 'unordered',
  withPadding,
  spacing,
  className,
  ...rest
}: ListProps) {
  const props = rest;
  const Component = type === 'ordered' ? 'ol' : 'ul';
  return (
    <Component
      className={cn(
        type === 'ordered' ? 'list-decimal' : 'list-disc',
        'pl-5',
        withPadding && 'pl-8',
        size && FONT_SIZE[size],
        spacing && LIST_SPACING[spacing],
        className,
      )}
      {...(props as ComponentPropsWithoutRef<'ul'>)}
    />
  );
}

function ListItem({ className, ...rest }: ComponentPropsWithoutRef<'li'>) {
  const props = rest;
  return <li className={cn(className)} {...props} />;
}

List.Item = ListItem;
