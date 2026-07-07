import { Toast } from '@base-ui/react/toast';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '@/util/cn';

// A global toast manager so `showSuccess` / `showFailure` / `notifications.show`
// can be called imperatively from anywhere (e.g. tRPC mutation callbacks),
// replacing @mantine/notifications. Mount <NotificationsProvider> once near the
// root so these render.
export const toastManager = Toast.createToastManager();

type ToastType = 'success' | 'error' | 'info' | 'warning';

export type NotificationData = {
  id?: string;
  title?: ReactNode;
  message?: ReactNode;
  color?: string;
  icon?: ReactNode;
  autoClose?: number | false;
};

function colorToType(color?: string): ToastType {
  switch (color) {
    case 'green':
    case 'teal':
      return 'success';
    case 'red':
      return 'error';
    case 'yellow':
    case 'orange':
      return 'warning';
    default:
      return 'info';
  }
}

function add(type: ToastType, data: NotificationData): string {
  return toastManager.add({
    title: data.title,
    description: data.message,
    type,
    timeout: data.autoClose === false ? 0 : data.autoClose,
    data: data.icon ? { icon: data.icon } : undefined,
  });
}

export function showSuccess(data: NotificationData): string {
  return add('success', data);
}

export function showFailure(data: NotificationData): string {
  return add('error', data);
}

export function showInfo(data: NotificationData): string {
  return add('info', data);
}

// Mantine-compatible imperative API: `notifications.show({ title, message, color })`.
export const notifications = {
  show: (data: NotificationData) => add(colorToType(data.color), data),
  hide: (id: string) => toastManager.close(id),
  update: (data: NotificationData & { id: string }) =>
    toastManager.update(data.id, {
      title: data.title,
      description: data.message,
      type: colorToType(data.color),
    }),
  clean: () => {
    // no-op: Base UI has no bulk-clear; toasts auto-dismiss.
  },
};

const TYPE_ACCENT: Record<ToastType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-brand',
  warning: 'text-orange-600 dark:text-orange-400',
};

function TypeIcon({ type }: { type: ToastType }) {
  const className = cn('shrink-0', TYPE_ACCENT[type]);
  switch (type) {
    case 'success':
      return <IconCircleCheck size={20} className={className} />;
    case 'error':
      return <IconAlertTriangle size={20} className={className} />;
    case 'warning':
      return <IconAlertTriangle size={20} className={className} />;
    default:
      return <IconInfoCircle size={20} className={className} />;
  }
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const type = (toast.type as ToastType) ?? 'info';
    const customIcon = (toast.data as { icon?: ReactNode } | undefined)?.icon;
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          'flex items-start gap-3 rounded-lg border-fancy-pants bg-white p-3 shadow-lg transition-all duration-200 dark:bg-zinc-900',
          'data-[starting-style]:translate-x-4 data-[starting-style]:opacity-0',
          'data-[ending-style]:translate-x-4 data-[ending-style]:opacity-0',
        )}
      >
        {customIcon ?? <TypeIcon type={type} />}
        <div className="min-w-0 flex-1">
          {toast.title ? (
            <Toast.Title className="text-primary text-sm font-semibold" />
          ) : null}
          {toast.description ? (
            <Toast.Description className="text-secondary text-sm" />
          ) : null}
        </div>
        <Toast.Close
          aria-label="Dismiss"
          className="text-secondary hover:text-primary shrink-0 rounded p-0.5 transition-colors"
        >
          <IconX size={16} />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

export function NotificationsProvider({ children }: PropsWithChildren) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed top-4 right-4 z-[100] flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
