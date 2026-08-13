import { IconArrowUpRight } from '@tabler/icons-react';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/util/cn';

export type DashboardPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function DashboardPageHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  className,
}: DashboardPageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-7 flex flex-col gap-5 border-dashboard-rule border-b pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="max-w-3xl min-w-0">
        {eyebrow ? (
          <div className="text-brand mb-2 font-mono text-[0.68rem] tracking-[0.18em] uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="dashboard-page-title text-dashboard-ink text-3xl leading-[1.05] sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="text-secondary mt-2 max-w-2xl text-sm leading-6 sm:text-base">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export type DashboardSectionProps = ComponentPropsWithoutRef<'section'> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function DashboardSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: DashboardSectionProps) {
  return (
    <section className={cn('mb-8 last:mb-0', className)} {...props}>
      {title || description || action ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-dashboard-ink text-lg font-semibold tracking-tight">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-secondary mt-1 max-w-2xl text-sm leading-5">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function DashboardPanel({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('dashboard-panel p-4 sm:p-5', className)} {...props}>
      {children}
    </div>
  );
}

type DashboardLinkCardProps = Omit<
  LinkProps,
  'children' | 'className' | 'title'
> & {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function DashboardLinkCard({
  title,
  description,
  icon,
  badge,
  footer,
  className,
  ...linkProps
}: DashboardLinkCardProps) {
  return (
    <article
      className={cn('dashboard-card', className)}
      data-interactive="true"
    >
      <Link
        {...linkProps}
        className="absolute inset-0 z-10 rounded-[inherit] outline-none"
        aria-label={typeof title === 'string' ? title : undefined}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <span className="bg-dashboard-accent-soft text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-dashboard-ink font-semibold tracking-tight">
              {title}
            </h3>
            <p className="text-secondary mt-1 text-sm leading-5">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <IconArrowUpRight
            aria-hidden="true"
            size={16}
            className="text-muted"
          />
        </div>
      </div>
      {footer ? (
        <div className="border-dashboard-rule mt-4 border-t pt-3">{footer}</div>
      ) : null}
    </article>
  );
}
