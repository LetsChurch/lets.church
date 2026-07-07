import { Dialog } from '@base-ui/react/dialog';
import { IconX } from '@tabler/icons-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/util/cn';

type LcModalRootProps = ComponentPropsWithoutRef<typeof Dialog.Root>;

export function LcModalRoot({ children, ...props }: LcModalRootProps) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>;
}

type LcModalTriggerProps = ComponentPropsWithoutRef<typeof Dialog.Trigger>;

export function LcModalTrigger({ children, ...props }: LcModalTriggerProps) {
  return <Dialog.Trigger {...props}>{children}</Dialog.Trigger>;
}

type LcModalPortalProps = ComponentPropsWithoutRef<typeof Dialog.Portal>;

export function LcModalPortal({ children, ...props }: LcModalPortalProps) {
  return <Dialog.Portal {...props}>{children}</Dialog.Portal>;
}

type LcModalBackdropProps = Omit<
  ComponentPropsWithoutRef<typeof Dialog.Backdrop>,
  'className'
> & {
  className?: string;
};

export function LcModalBackdrop({ className, ...props }: LcModalBackdropProps) {
  return (
    <Dialog.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

const modalPopupVariants = cva(
  // `max-h-[90dvh] overflow-y-auto` keeps a tall modal on-screen and scrollable
  // instead of overflowing past the viewport with its actions unreachable.
  '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-full overflow-y-auto rounded-lg border-fancy-pants bg-white p-6 shadow-xl transition-all duration-300 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-zinc-900',
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-2xl',
        '2xl': 'max-w-3xl',
        // Full-screen: override the centering base so the popup fills the
        // viewport. It manages its own internal scroll regions, so keep the
        // outer popup `overflow-hidden` (overrides the base `overflow-y-auto`).
        full: 'top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

type LcModalPopupProps = Omit<
  ComponentPropsWithoutRef<typeof Dialog.Popup>,
  'className'
> &
  VariantProps<typeof modalPopupVariants> & {
    className?: string;
  };

export function LcModalPopup({
  children,
  className,
  size,
  ...props
}: LcModalPopupProps) {
  return (
    <Dialog.Popup
      className={cn(modalPopupVariants({ size }), className)}
      {...props}
    >
      {children}
    </Dialog.Popup>
  );
}

type LcModalTitleProps = ComponentPropsWithoutRef<typeof Dialog.Title>;

export function LcModalTitle({
  children,
  className = '',
  ...props
}: LcModalTitleProps) {
  return (
    <Dialog.Title
      className={`text-primary text-lg font-semibold ${className}`}
      {...props}
    >
      {children}
    </Dialog.Title>
  );
}

type LcModalDescriptionProps = ComponentPropsWithoutRef<
  typeof Dialog.Description
>;

export function LcModalDescription({
  children,
  className = '',
  ...props
}: LcModalDescriptionProps) {
  return (
    <Dialog.Description
      className={`text-secondary text-sm ${className}`}
      {...props}
    >
      {children}
    </Dialog.Description>
  );
}

type LcModalCloseProps = ComponentPropsWithoutRef<typeof Dialog.Close>;

export function LcModalClose({ className = '', ...props }: LcModalCloseProps) {
  // Dialog.Close renders a native <button type="button"> by default, so we style
  // it directly rather than composing one via render.
  return (
    <Dialog.Close
      {...props}
      className={`hover:text-primary dark:hover:text-primary flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${className}`}
    >
      <IconX size={20} />
    </Dialog.Close>
  );
}

// Export a namespace for easy access
export const LcModal = {
  Root: LcModalRoot,
  Trigger: LcModalTrigger,
  Portal: LcModalPortal,
  Backdrop: LcModalBackdrop,
  Popup: LcModalPopup,
  Title: LcModalTitle,
  Description: LcModalDescription,
  Close: LcModalClose,
};

// Helper component for modal header with title and close button
type ModalHeaderProps = {
  title: ReactNode;
  onClose?: () => void;
  className?: string;
};

export function ModalHeader({ title, className = '' }: ModalHeaderProps) {
  return (
    <div className={`flex items-center justify-between pb-4 ${className}`}>
      <LcModalTitle>{title}</LcModalTitle>
      <LcModalClose />
    </div>
  );
}
