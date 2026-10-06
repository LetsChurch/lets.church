/**
 * Small Base UI-based kit for the extension's pages and its Studio overlay.
 * Popups portal into `PortalContainer` so that, inside YouTube Studio, they
 * stay within our shadow root (and its styles) instead of `document.body`.
 */
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Dialog } from '@base-ui/react/dialog';
import { Select } from '@base-ui/react/select';
import {
  type ButtonHTMLAttributes,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

export const PortalContainerProvider = PortalContainerContext.Provider;

function usePortalContainer() {
  return useContext(PortalContainerContext) ?? undefined;
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'bg-primary text-on-primary hover:opacity-90',
        variant === 'secondary' &&
          'border border-control-border bg-tonal text-ink hover:bg-tonal-hover',
        variant === 'ghost' && 'text-ink hover:bg-tonal',
        variant === 'danger' &&
          'border border-control-border bg-tonal text-danger hover:bg-tonal-hover',
        className,
      )}
      {...props}
    />
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const container = usePortalContainer();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0 z-[2147483646] bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-[2147483647] flex max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-rule bg-surface text-ink shadow-2xl transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="px-6 pt-6 pb-3">
            <Dialog.Title className="text-xl font-semibold">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="text-muted mt-1 text-sm">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
            {children}
          </div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 px-6 pt-3 pb-6">
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SelectField<V extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: ReadonlyArray<{ value: V; label: string }>;
  disabled?: boolean;
}) {
  const container = usePortalContainer();
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next as V);
        }
      }}
      disabled={disabled}
    >
      <div className="flex flex-col gap-1">
        <Select.Label className="text-muted text-xs font-medium">
          {label}
        </Select.Label>
        <Select.Trigger className="border-rule bg-surface text-ink focus-visible:outline-focus rounded-field flex h-9 min-w-48 cursor-pointer items-center justify-between gap-2 border px-3 text-left text-sm focus-visible:outline-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50">
          <Select.Value />
          <Select.Icon className="text-muted" aria-hidden>
            ▾
          </Select.Icon>
        </Select.Trigger>
      </div>
      <Select.Portal container={container}>
        <Select.Positioner
          className="z-[2147483647] outline-none"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="border-rule bg-surface text-ink rounded-field max-h-72 min-w-[var(--anchor-width)] overflow-y-auto border p-1 text-sm shadow-xl">
            <Select.List>
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="data-[highlighted]:bg-accent-soft flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none"
                >
                  <Select.ItemIndicator className="text-ink w-4">
                    ✓
                  </Select.ItemIndicator>
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name; the checkbox is often visually labelled by its row. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="border-muted bg-surface focus-visible:outline-focus data-[checked]:border-primary data-[checked]:bg-primary flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
    >
      <BaseCheckbox.Indicator className="text-on-primary text-[11px] leading-none">
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: 'text' | 'date';
}) {
  const id = useId();
  const className =
    'w-full rounded-field border border-rule bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus';
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-muted text-xs font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="bg-canvas h-1.5 w-full overflow-hidden rounded-full"
    >
      <div
        className="bg-primary h-full rounded-full transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function formatDuration(seconds: number | null) {
  if (seconds == null) {
    return '—';
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null) {
  if (bytes == null) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let unit = 0;
  while (n >= 1000 && unit < units.length - 1) {
    n /= 1000;
    unit++;
  }
  return `${n.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
