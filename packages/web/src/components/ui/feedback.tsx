import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/util/cn';

import {
  ALERT,
  ALERT_ACCENT,
  BADGE,
  type BadgeVariant,
  type LcColor,
  normalizeColor,
} from './_colors';

const SIZE_PX: Record<string, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
};

function resolveSize(size: number | string | undefined, fallback: number) {
  if (size === undefined) return fallback;
  if (typeof size === 'number') return size;
  return SIZE_PX[size] ?? fallback;
}

// --- Loader ----------------------------------------------------------------

type LoaderProps = {
  size?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: string;
};

export function Loader({ size, className, color }: LoaderProps) {
  const px = resolveSize(size, 20);
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG spinner with role=status is the correct live-region pattern
    <svg
      className={cn('animate-spin text-brand', className)}
      style={color ? { color } : undefined}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <title>Loading</title>
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}

// --- LoadingOverlay --------------------------------------------------------

type LoadingOverlayProps = {
  visible?: boolean;
  className?: string;
  withLoader?: boolean;
};

// Absolutely fills its nearest positioned ancestor — the parent must be
// `relative`. Its layer stays above local z-10 controls and decorative
// pseudo-elements so the backdrop blur covers the entire subtree.
export function LoadingOverlay({
  visible,
  className,
  withLoader = true,
}: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-white/60 backdrop-blur-sm dark:bg-zinc-950/60',
        className,
      )}
    >
      {withLoader ? <Loader /> : null}
    </div>
  );
}

// --- Badge -----------------------------------------------------------------

type BadgeProps = Omit<ComponentPropsWithoutRef<'span'>, 'color'> & {
  color?: string;
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  circle?: boolean;
};

const BADGE_SIZE: Record<string, string> = {
  xs: 'h-4 px-1.5 text-[10px]',
  sm: 'h-5 px-2 text-xs',
  md: 'h-6 px-2.5 text-xs',
  lg: 'h-7 px-3 text-sm',
};

export function Badge({
  color,
  variant = 'light',
  size = 'md',
  leftSection,
  rightSection,
  circle,
  className,
  children,
  ...rest
}: BadgeProps) {
  const props = rest;
  const resolved: LcColor = normalizeColor(color);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold uppercase leading-none tracking-wide',
        BADGE_SIZE[size],
        circle && 'aspect-square justify-center px-0',
        BADGE[resolved][variant],
        className,
      )}
      {...props}
    >
      {leftSection}
      {children}
      {rightSection}
    </span>
  );
}

// --- Alert -----------------------------------------------------------------

type AlertProps = Omit<ComponentPropsWithoutRef<'div'>, 'color' | 'title'> & {
  color?: string;
  variant?: 'light' | 'filled';
  title?: ReactNode;
  icon?: ReactNode;
  withCloseButton?: boolean;
  onClose?: () => void;
};

export function Alert({
  color,
  title,
  icon,
  withCloseButton,
  onClose,
  className,
  children,
  ...rest
}: AlertProps) {
  const props = rest;
  const resolved: LcColor = normalizeColor(color);
  return (
    <div
      role="alert"
      className={cn('rounded-lg p-4 text-sm', ALERT[resolved], className)}
      {...props}
    >
      <div className="flex gap-3">
        {icon ? (
          <span className={cn('mt-0.5 shrink-0', ALERT_ACCENT[resolved])}>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <div className={cn('mb-1 font-semibold', ALERT_ACCENT[resolved])}>
              {title}
            </div>
          ) : null}
          {children}
        </div>
        {withCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              'shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100',
              ALERT_ACCENT[resolved],
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <title>Close</title>
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
