import {
  type ComponentPropsWithoutRef,
  type ElementType,
  forwardRef,
  type ReactNode,
} from 'react';

import { cn } from '@/util/cn';

import {
  BUTTON,
  type ButtonVariant,
  type LcColor,
  normalizeColor,
} from './_colors';
import { Loader } from './feedback';

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-3 text-xs',
  sm: 'h-8 px-3.5 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-base',
  xl: 'h-12 px-6 text-base',
};

const RADIUS: Record<string, string> = {
  xs: 'rounded',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  xl: 'rounded-full',
};

// Passthrough props for a composed router `<Link>` (via `component={Link}`).
// Enumerated rather than a broad index signature so that `forwardRef`'s
// `PropsWithoutRef` doesn't collapse the named props to `unknown`.
type LinkPassthroughProps = {
  component?: ElementType;
  to?: unknown;
  params?: unknown;
  search?: unknown;
  hash?: unknown;
  state?: unknown;
  replace?: unknown;
  mask?: unknown;
  preload?: unknown;
  activeProps?: unknown;
  inactiveProps?: unknown;
  activeOptions?: unknown;
};

type ButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'color'> &
  LinkPassthroughProps & {
    variant?: ButtonVariant;
    color?: string;
    size?: ButtonSize;
    radius?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    loading?: boolean;
    fullWidth?: boolean;
    leftSection?: ReactNode;
    rightSection?: ReactNode;
  };

// forwardRef so these compose as Base UI `render` triggers (menus, tooltips,
// popovers) which inject a ref onto the element.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'filled',
      color,
      size = 'md',
      radius = 'xl',
      loading = false,
      fullWidth = false,
      leftSection,
      rightSection,
      component,
      className,
      children,
      disabled,
      type,
      ...rest
    },
    ref,
  ) {
    const resolved: LcColor = normalizeColor(color);
    const Component = component ?? 'button';
    const loaderColor = variant === 'filled' ? 'currentColor' : undefined;
    return (
      <Component
        ref={ref}
        type={component ? undefined : (type ?? 'button')}
        disabled={component ? undefined : disabled || loading}
        aria-disabled={disabled || loading ? true : undefined}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 whitespace-nowrap border-fancy-pants font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60',
          BUTTON_SIZE[size],
          RADIUS[radius],
          BUTTON[resolved][variant],
          fullWidth && 'w-full',
          (disabled || loading) && 'pointer-events-none opacity-60',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Loader
            size={size === 'xs' || size === 'sm' ? 14 : 16}
            color={loaderColor}
          />
        ) : (
          leftSection
        )}
        {children}
        {rightSection}
      </Component>
    );
  },
);

// --- ActionIcon ------------------------------------------------------------

type ActionIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ACTION_ICON_SIZE: Record<ActionIconSize, string> = {
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-9',
  xl: 'size-10',
};

type ActionIconProps = Omit<ComponentPropsWithoutRef<'button'>, 'color'> &
  LinkPassthroughProps & {
    variant?: ButtonVariant;
    color?: string;
    size?: ActionIconSize;
    radius?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    loading?: boolean;
  };

export const ActionIcon = forwardRef<HTMLButtonElement, ActionIconProps>(
  function ActionIcon(
    {
      variant = 'subtle',
      color,
      size = 'md',
      radius = 'md',
      loading = false,
      component,
      className,
      children,
      disabled,
      type,
      ...rest
    },
    ref,
  ) {
    const resolved: LcColor = normalizeColor(color);
    const Component = component ?? 'button';
    return (
      <Component
        ref={ref}
        type={component ? undefined : (type ?? 'button')}
        disabled={component ? undefined : disabled || loading}
        aria-disabled={disabled || loading ? true : undefined}
        className={cn(
          'inline-flex shrink-0 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-60',
          ACTION_ICON_SIZE[size],
          RADIUS[radius],
          BUTTON[resolved][variant],
          (disabled || loading) && 'pointer-events-none opacity-60',
          className,
        )}
        {...rest}
      >
        {loading ? <Loader size={16} /> : children}
      </Component>
    );
  },
);
