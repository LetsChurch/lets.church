import { Drawer } from '@base-ui/react/drawer';
import { type ReactNode, useState } from 'react';

// A reusable mobile bottom-sheet picker, built on the Base UI Drawer: a styled
// trigger opens a modal sheet (dimmed backdrop, slide-up, swipe-down to dismiss)
// holding the picker content. `children` receives a `close` callback so list
// items (links) can dismiss the sheet on selection. The reader-nav pickers use
// this below the `lg` breakpoint; on desktop they keep their Base UI Menu /
// Popover.
export function PickerDrawer({
  triggerClassName,
  trigger,
  title,
  children,
}: {
  triggerClassName: string;
  trigger: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger className={triggerClassName}>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-ink-strong/40 fixed inset-0 z-40 transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[swiping]:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            data-drawer
            className="border-line-strong bg-paper-raised flex max-h-[82dvh] w-full [transform:translateY(var(--drawer-swipe-movement-y))] flex-col rounded-t-2xl border-t transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full data-[swiping]:duration-0"
          >
            <div className="flex flex-shrink-0 cursor-grab justify-center pt-2.5 pb-1 active:cursor-grabbing">
              <div className="bg-line-strong h-1.5 w-10 rounded-full" />
            </div>
            <Drawer.Title className="text-gold-soft flex-shrink-0 px-5 pt-1 pb-3 text-[11px] font-bold tracking-[0.16em] uppercase">
              {title}
            </Drawer.Title>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(24px,env(safe-area-inset-bottom))]">
              {children(() => setOpen(false))}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
