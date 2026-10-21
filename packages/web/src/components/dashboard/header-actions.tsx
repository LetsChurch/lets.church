import type { LinkProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
  MenuItemButton,
  MenuItemRouterLink,
  OverflowMenu,
} from '@/components/lc-menu';
import { Button } from '@/components/ui';
import type { ButtonVariant } from '@/components/ui/_colors';

export type HeaderAction = {
  key: string;
  label: string;
  /** Longer label used when the action is collapsed into the menu. */
  menuLabel?: string;
  icon: ReactNode;
  color?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
} & (
  | { onClick: () => void; link?: never }
  | { link: Omit<LinkProps, 'children' | 'className'>; onClick?: never }
);

// Collapsed actions keep their color as a text tint so destructive/approval
// actions still read as such inside the menu.
const MENU_TINT: Record<string, string> = {
  green: 'text-green-600 dark:text-green-400',
  orange: 'text-orange-600 dark:text-orange-400',
  red: 'text-red-600 dark:text-red-400',
};

type HeaderActionsProps = {
  /** Ordered most-important first; falsy entries are skipped. */
  actions: Array<HeaderAction | false | null | undefined>;
  /** Accessible label for the overflow menu trigger. */
  menuLabel: string;
  /** Show at most this many buttons; beyond it the first stays a button and
   * the rest move into a "more" menu. */
  maxInline?: number;
};

/**
 * A page header's action cluster. Up to `maxInline` actions render as
 * buttons; past that, the primary action stays a button and the rest collapse
 * into an overflow menu so headers don't turn into a wall of buttons.
 */
export function HeaderActions({
  actions,
  menuLabel,
  maxInline = 2,
}: HeaderActionsProps) {
  const visible = actions.filter((a): a is HeaderAction => Boolean(a));
  if (visible.length === 0) return null;

  const collapse = visible.length > maxInline;
  const inline = collapse ? visible.slice(0, 1) : visible;
  const overflow = collapse ? visible.slice(1) : [];

  return (
    <div className="flex shrink-0 items-center gap-2">
      {inline.map((action) => (
        <Button
          key={action.key}
          variant={action.variant ?? 'light'}
          color={action.color}
          leftSection={action.icon}
          loading={action.loading}
          disabled={action.disabled}
          {...(action.link
            ? { component: Link, ...action.link }
            : { onClick: action.onClick })}
        >
          {action.label}
        </Button>
      ))}
      {overflow.length > 0 && (
        <OverflowMenu
          label={menuLabel}
          triggerProps={{ size: 'lg', variant: 'default' }}
        >
          {overflow.map((action) => {
            const className = (action.color && MENU_TINT[action.color]) || '';
            const label = action.menuLabel ?? action.label;
            return action.link ? (
              <MenuItemRouterLink
                key={action.key}
                icon={action.icon}
                className={className}
                {...action.link}
              >
                {label}
              </MenuItemRouterLink>
            ) : (
              <MenuItemButton
                key={action.key}
                icon={action.icon}
                className={className}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
              >
                {label}
              </MenuItemButton>
            );
          })}
        </OverflowMenu>
      )}
    </div>
  );
}
