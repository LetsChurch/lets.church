import { Drawer } from '@base-ui/react/drawer';
import type * as React from 'react';
import { cn } from '@/util/cn';

// Mobile bottom-sheet drawer built on the dedicated Base UI `Drawer`. Base UI
// handles swipe-to-dismiss, outside-press dismissal, focus trapping, and the
// slide/backdrop transitions natively (via `--drawer-swipe-movement-y`,
// `data-[swiping]`, and `data-[starting/ending-style]`), so this is just styling
// — no manual touch handlers or click-outside listeners. The compound API
// (Root/Portal/Backdrop/Content/Title/Close) is unchanged from the previous
// Dialog-based implementation. Backdrop is optional; without it the sheet still
// dismisses on outside press (the Drawer is modal) but isn't dimmed.

type MobileDrawerRootProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

function MobileDrawerRoot({
  open,
  onOpenChange,
  children,
}: MobileDrawerRootProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Drawer.Root>
  );
}

function MobileDrawerPortal({ children }: { children: React.ReactNode }) {
  return <Drawer.Portal>{children}</Drawer.Portal>;
}

function MobileDrawerBackdrop({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Drawer.Backdrop>) {
  return (
    <Drawer.Backdrop
      {...props}
      // Base UI className can be a (state) => string; merge either form.
      className={(state) =>
        cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[swiping]:duration-0',
          typeof className === 'function' ? className(state) : className,
        )
      }
    />
  );
}

type MobileDrawerContentProps = React.ComponentPropsWithoutRef<
  typeof Drawer.Popup
> & {
  children: React.ReactNode;
};

function MobileDrawerContent({
  children,
  className,
  ...props
}: MobileDrawerContentProps) {
  return (
    <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
      <Drawer.Popup
        {...props}
        className={(state) =>
          cn(
            'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-gray-950/10 border-solid bg-white outline-none transition-transform duration-300 ease-out [transform:translateY(var(--drawer-swipe-movement-y))] data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full data-[swiping]:duration-0 dark:border-white/10 dark:bg-zinc-900',
            typeof className === 'function' ? className(state) : className,
          )
        }
      >
        {/* Grab handle — Base UI Drawer makes the whole popup swipe-dismissable */}
        <div className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing">
          <div className="h-[3px] w-9 rounded-[2.5px] bg-gray-950/30 dark:bg-[rgba(235,235,245,0.3)]" />
        </div>

        {children}
      </Drawer.Popup>
    </Drawer.Viewport>
  );
}

function MobileDrawerTitle(
  props: React.ComponentPropsWithoutRef<typeof Drawer.Title>,
) {
  return <Drawer.Title {...props} />;
}

function MobileDrawerClose(
  props: React.ComponentPropsWithoutRef<typeof Drawer.Close>,
) {
  return <Drawer.Close {...props} />;
}

export const MobileDrawer = {
  Root: MobileDrawerRoot,
  Portal: MobileDrawerPortal,
  Backdrop: MobileDrawerBackdrop,
  Content: MobileDrawerContent,
  Title: MobileDrawerTitle,
  Close: MobileDrawerClose,
};
