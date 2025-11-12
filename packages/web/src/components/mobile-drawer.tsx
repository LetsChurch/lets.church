import { Dialog } from '@base-ui-components/react/dialog';
import * as React from 'react';
import { cn } from '@/util/cn';

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

type MobileDrawerPortalProps = {
  children: React.ReactNode;
};

function MobileDrawerPortal({ children }: MobileDrawerPortalProps) {
  return <Dialog.Portal>{children}</Dialog.Portal>;
}

function MobileDrawerBackdrop(props: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <Dialog.Backdrop
      {...props}
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        props.className,
      )}
    />
  );
}

type MobileDrawerContentProps = React.ComponentPropsWithoutRef<'div'> & {
  children: React.ReactNode;
  dragThreshold?: number;
};

function MobileDrawerContent({
  children,
  dragThreshold = 100,
  className = '',
  ...props
}: MobileDrawerContentProps) {
  const [dragY, setDragY] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [startY, setStartY] = React.useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const context = React.useContext(MobileDrawerContext);
  if (!context) {
    throw new Error(
      'MobileDrawerContent must be used within MobileDrawer.Root',
    );
  }

  const { open, onOpenChange } = context;

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY;
    // Only allow dragging down (positive delta)
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // Close threshold
    if (dragY > dragThreshold) {
      onOpenChange(false);
    } else {
      // Reset drag position if not closing
      setDragY(0);
    }
  };
  // Handle click outside
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };

    // Use capture phase to catch the event before it bubbles
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [open, onOpenChange]);

  return (
    <Dialog.Popup
      {...props}
      ref={contentRef}
      className={cn(
        `fixed right-0 bottom-0 left-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-gray-950/10 border-solid bg-white transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full dark:border-white/10 dark:bg-zinc-900`,
        className,
      )}
      style={{
        transform:
          isDragging || dragY > 0 ? `translateY(${dragY}px)` : undefined,
        transition: isDragging ? 'none' : undefined,
        ...props.style,
      }}
    >
      {/* Drawer Grabber */}
      <div
        className="relative h-[23px] w-full shrink-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="-translate-x-1/2 absolute top-2 left-1/2 h-[3px] w-9 rounded-[2.5px] bg-gray-950/30 dark:bg-[rgba(235,235,245,0.3)]" />
      </div>

      {children}
    </Dialog.Popup>
  );
}

function MobileDrawerTitle(
  props: React.ComponentPropsWithoutRef<typeof Dialog.Title>,
) {
  return <Dialog.Title {...props} />;
}

function MobileDrawerClose(
  props: React.ComponentPropsWithoutRef<typeof Dialog.Close>,
) {
  return <Dialog.Close {...props} />;
}

type MobileDrawerContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MobileDrawerContext =
  React.createContext<MobileDrawerContextValue | null>(null);

function MobileDrawerRootWithContext({
  open,
  onOpenChange,
  children,
}: MobileDrawerRootProps) {
  const value = React.useMemo(
    () => ({ open, onOpenChange }),
    [open, onOpenChange],
  );

  return (
    <MobileDrawerContext.Provider value={value}>
      <MobileDrawerRoot open={open} onOpenChange={onOpenChange}>
        {children}
      </MobileDrawerRoot>
    </MobileDrawerContext.Provider>
  );
}

export const MobileDrawer = {
  Root: MobileDrawerRootWithContext,
  Portal: MobileDrawerPortal,
  Backdrop: MobileDrawerBackdrop,
  Content: MobileDrawerContent,
  Title: MobileDrawerTitle,
  Close: MobileDrawerClose,
};
