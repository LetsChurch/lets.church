import { Menu } from '@base-ui/react/menu';
import { IconDotsVertical } from '@tabler/icons-react';
import type { LinkProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { ActionIcon } from '@/components/ui';

type LcMenuRootProps = ComponentPropsWithoutRef<typeof Menu.Root>;

export function LcMenuRoot({ children, ...props }: LcMenuRootProps) {
  return <Menu.Root {...props}>{children}</Menu.Root>;
}

type LcMenuTriggerProps = ComponentPropsWithoutRef<typeof Menu.Trigger>;

export function LcMenuTrigger({ children, ...props }: LcMenuTriggerProps) {
  return <Menu.Trigger {...props}>{children}</Menu.Trigger>;
}

type LcMenuPortalProps = ComponentPropsWithoutRef<typeof Menu.Portal>;

export function LcMenuPortal({ children, ...props }: LcMenuPortalProps) {
  return <Menu.Portal {...props}>{children}</Menu.Portal>;
}

type LcMenuPositionerProps = ComponentPropsWithoutRef<typeof Menu.Positioner>;

export function LcMenuPositioner({
  children,
  className = '',
  ...props
}: LcMenuPositionerProps) {
  return (
    <Menu.Positioner className={`z-50 ${className}`} {...props}>
      {children}
    </Menu.Positioner>
  );
}

type LcMenuPopupProps = ComponentPropsWithoutRef<typeof Menu.Popup>;

export function LcMenuPopup({
  children,
  className = '',
  ...props
}: LcMenuPopupProps) {
  return (
    <Menu.Popup
      className={`border-fancy-pants min-w-[200px] rounded-lg bg-white p-1 shadow-xl transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-zinc-900 ${className}`}
      {...props}
    >
      {children}
    </Menu.Popup>
  );
}

type LcMenuItemProps = ComponentPropsWithoutRef<typeof Menu.Item>;

export function LcMenuItem({ children, ...props }: LcMenuItemProps) {
  return <Menu.Item {...props}>{children}</Menu.Item>;
}

type LcMenuSeparatorProps = ComponentPropsWithoutRef<typeof Menu.Separator>;

export function LcMenuSeparator({
  className = '',
  ...props
}: LcMenuSeparatorProps) {
  return (
    <Menu.Separator
      className={`my-1 h-px bg-gray-200 dark:bg-zinc-800 ${className}`}
      {...props}
    />
  );
}

// Export a namespace for easy access
export const LcMenu = {
  Root: LcMenuRoot,
  Trigger: LcMenuTrigger,
  Portal: LcMenuPortal,
  Positioner: LcMenuPositioner,
  Popup: LcMenuPopup,
  Item: LcMenuItem,
  Separator: LcMenuSeparator,
};

type OverflowMenuProps = {
  label: string;
  children: ReactNode;
  iconSize?: number;
  sideOffset?: number;
  triggerProps?: Omit<
    ComponentPropsWithoutRef<typeof ActionIcon>,
    'aria-label' | 'children'
  >;
};

export function OverflowMenu({
  label,
  children,
  iconSize = 16,
  sideOffset = 4,
  triggerProps,
}: OverflowMenuProps) {
  return (
    <LcMenu.Root>
      <LcMenu.Trigger
        render={
          <ActionIcon
            variant="subtle"
            color="gray"
            {...triggerProps}
            aria-label={label}
          >
            <IconDotsVertical size={iconSize} />
          </ActionIcon>
        }
      />
      <LcMenu.Portal>
        <LcMenu.Positioner align="end" sideOffset={sideOffset}>
          <LcMenu.Popup>{children}</LcMenu.Popup>
        </LcMenu.Positioner>
      </LcMenu.Portal>
    </LcMenu.Root>
  );
}

// Shared styling for all menu item variants
const menuItemClassName =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-primary text-sm outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-800';

// Helper component for menu items with consistent styling
type MenuItemButtonProps = {
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function MenuItemButton({
  onClick,
  children,
  icon,
  className = '',
}: MenuItemButtonProps) {
  return (
    <LcMenuItem
      render={(props) => (
        <button
          {...props}
          type="button"
          onClick={onClick}
          className={`${menuItemClassName} ${className}`}
        >
          {icon ? icon : null}
          {children}
        </button>
      )}
    />
  );
}

type MenuItemLinkProps = {
  href: string;
  download?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export function MenuItemLink({
  href,
  download,
  children,
  icon,
  className = '',
  onClick,
}: MenuItemLinkProps) {
  return (
    <LcMenuItem
      render={(props) => (
        <a
          {...props}
          href={href}
          download={download}
          onClick={onClick}
          className={`${menuItemClassName} ${className}`}
        >
          {icon ? icon : null}
          {children}
        </a>
      )}
    />
  );
}

type MenuItemRouterLinkProps = Omit<LinkProps, 'className' | 'children'> & {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function MenuItemRouterLink({
  children,
  icon,
  className = '',
  ...linkProps
}: MenuItemRouterLinkProps) {
  return (
    <LcMenuItem
      render={(props) => (
        <Link
          {...props}
          {...linkProps}
          className={`${menuItemClassName} ${className}`}
        >
          {icon ? icon : null}
          {children}
        </Link>
      )}
    />
  );
}
