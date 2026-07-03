import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Combobox } from '@base-ui/react/combobox';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconMinus,
  IconX,
} from '@tabler/icons-react';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useId,
  useState,
} from 'react';
import { cn } from '@/util/cn';

// --- Shared control styling ------------------------------------------------

export function controlClasses(error?: boolean) {
  return cn(
    'w-full rounded-lg border bg-white px-3 py-2 text-primary text-sm outline-none transition-colors placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900',
    error
      ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/30'
      : 'border-gray-300 focus:border-brand focus:ring-2 focus:ring-brand/25 dark:border-zinc-700',
  );
}

// --- InputWrapper ----------------------------------------------------------

type InputWrapperProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

export function InputWrapper({
  label,
  description,
  error,
  required,
  htmlFor,
  className,
  children,
}: InputWrapperProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="font-medium text-primary text-sm">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label>
      ) : null}
      {description ? (
        <p className="text-secondary text-xs">{description}</p>
      ) : null}
      {children}
      {error ? (
        <p className="text-red-600 text-xs dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

// --- TextInput -------------------------------------------------------------

type TextInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'size' | 'value' | 'defaultValue'
> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  value?: string;
  defaultValue?: string;
  wrapperClassName?: string;
  // Accepted for Mantine parity; visual size is fixed in the LC design.
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export function TextInput({
  label,
  description,
  error,
  required,
  leftSection,
  rightSection,
  className,
  wrapperClassName,
  id,
  size: _size,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = (
    <input
      id={inputId}
      required={required}
      className={cn(
        controlClasses(Boolean(error)),
        leftSection && 'pl-9',
        rightSection && 'pr-9',
        className,
      )}
      {...props}
    />
  );
  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      {leftSection || rightSection ? (
        <div className="relative">
          {leftSection ? (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              {leftSection}
            </span>
          ) : null}
          {input}
          {rightSection ? (
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
              {rightSection}
            </span>
          ) : null}
        </div>
      ) : (
        input
      )}
    </InputWrapper>
  );
}

// --- PasswordInput ---------------------------------------------------------

type PasswordInputProps = Omit<
  TextInputProps,
  'type' | 'rightSection' | 'leftSection' | 'size'
>;

export function PasswordInput({
  label,
  description,
  error,
  required,
  className,
  wrapperClassName,
  id,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          required={required}
          className={cn(controlClasses(Boolean(error)), 'pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted transition-colors hover:text-primary"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
    </InputWrapper>
  );
}

// --- Textarea --------------------------------------------------------------

type TextareaProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'defaultValue'
> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  value?: string;
  defaultValue?: string;
  autosize?: boolean;
  minRows?: number;
  maxRows?: number;
  wrapperClassName?: string;
};

export function Textarea({
  label,
  description,
  error,
  required,
  autosize,
  minRows = 3,
  maxRows,
  rows,
  className,
  wrapperClassName,
  id,
  style,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <textarea
        id={inputId}
        required={required}
        rows={rows ?? minRows}
        className={cn(
          controlClasses(Boolean(error)),
          'resize-y',
          autosize && 'field-sizing-content resize-none',
          className,
        )}
        style={{
          ...(autosize
            ? {
                minHeight: `${(minRows + 1) * 1.5}rem`,
                maxHeight: maxRows ? `${(maxRows + 1) * 1.5}rem` : undefined,
              }
            : {}),
          ...style,
        }}
        {...props}
      />
    </InputWrapper>
  );
}

// --- Select (native) -------------------------------------------------------

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = {
  group: string;
  items: ReadonlyArray<SelectOption>;
};
export type SelectData = ReadonlyArray<SelectOption | SelectGroup>;

function isGroup(item: SelectOption | SelectGroup): item is SelectGroup {
  return 'group' in item && 'items' in item;
}

type SelectProps = Omit<
  ComponentPropsWithoutRef<'select'>,
  'value' | 'defaultValue' | 'onChange'
> & {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  data: SelectData;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  wrapperClassName?: string;
};

export function Select({
  label,
  description,
  error,
  required,
  data,
  placeholder,
  onChange,
  className,
  wrapperClassName,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const renderOption = (opt: SelectOption) => (
    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
      {opt.label}
    </option>
  );
  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <select
        id={inputId}
        required={required}
        className={cn(controlClasses(Boolean(error)), 'pr-8', className)}
        onChange={(e) => onChange?.(e.target.value)}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {data.map((item) =>
          isGroup(item) ? (
            <optgroup key={item.group} label={item.group}>
              {item.items.map(renderOption)}
            </optgroup>
          ) : (
            renderOption(item)
          ),
        )}
      </select>
    </InputWrapper>
  );
}

// --- Checkbox --------------------------------------------------------------

type CheckboxProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  /** Partial-selection state (e.g. a "select all" header when only some rows
   * are selected). Renders a dash instead of a check. */
  indeterminate?: boolean;
  onChange?: (checked: boolean) => void;
  onBlur?: () => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Checkbox({
  label,
  description,
  error,
  checked,
  defaultChecked,
  indeterminate,
  onChange,
  onBlur,
  name,
  required,
  disabled,
  className,
}: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-2">
        <BaseCheckbox.Root
          id={id}
          name={name}
          checked={checked}
          defaultChecked={defaultChecked}
          indeterminate={indeterminate}
          required={required}
          disabled={disabled}
          onCheckedChange={(value) => onChange?.(value === true)}
          onBlur={onBlur}
          className={cn(
            'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-white transition-colors data-[checked]:border-brand data-[indeterminate]:border-brand data-[checked]:bg-brand data-[indeterminate]:bg-brand dark:border-zinc-600 dark:bg-zinc-900',
            error && 'border-red-500',
          )}
        >
          <BaseCheckbox.Indicator className="flex">
            {indeterminate ? (
              <IconMinus size={14} stroke={3} />
            ) : (
              <IconCheck size={14} stroke={3} />
            )}
          </BaseCheckbox.Indicator>
        </BaseCheckbox.Root>
        {label || description ? (
          <label htmlFor={id} className="select-none">
            {label ? (
              <span className="font-medium text-primary text-sm">{label}</span>
            ) : null}
            {description ? (
              <span className="block text-secondary text-xs">
                {description}
              </span>
            ) : null}
          </label>
        ) : null}
      </div>
      {error ? (
        <p className="text-red-600 text-xs dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

// --- Radio + RadioGroup ----------------------------------------------------

type RadioProps = {
  value: string;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function Radio({
  value,
  label,
  description,
  disabled,
  className,
}: RadioProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <BaseRadio.Root
        id={id}
        value={value}
        disabled={disabled}
        className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white transition-colors data-[checked]:border-brand dark:border-zinc-600 dark:bg-zinc-900"
      >
        <BaseRadio.Indicator className="size-2.5 rounded-full bg-brand" />
      </BaseRadio.Root>
      {label || description ? (
        <label htmlFor={id} className="select-none">
          {label ? (
            <span className="font-medium text-primary text-sm">{label}</span>
          ) : null}
          {description ? (
            <span className="block text-secondary text-xs">{description}</span>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}

type RadioGroupProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function RadioGroup({
  label,
  description,
  error,
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  required,
  className,
  children,
}: RadioGroupProps) {
  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
    >
      <BaseRadioGroup
        name={name}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => onChange?.(next as string)}
        onBlur={onBlur}
        className="flex flex-col gap-2"
      >
        {children}
      </BaseRadioGroup>
    </InputWrapper>
  );
}

Radio.Group = RadioGroup;

// --- MultiSelect (searchable) ----------------------------------------------

type MultiSelectProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  data: SelectData;
  value?: string[];
  onChange?: (value: string[]) => void;
  required?: boolean;
  searchable?: boolean;
  className?: string;
};

function flattenOptions(data: SelectData): SelectOption[] {
  return data.flatMap((item) => (isGroup(item) ? item.items : [item]));
}

export function MultiSelect({
  label,
  description,
  error,
  placeholder,
  data,
  value = [],
  onChange,
  required,
  className,
}: MultiSelectProps) {
  const options = flattenOptions(data);
  const selected = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is SelectOption => Boolean(o));

  return (
    <InputWrapper
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
    >
      <Combobox.Root
        items={options}
        multiple
        value={selected}
        onValueChange={(items: SelectOption[]) =>
          onChange?.(items.map((i) => i.value))
        }
      >
        <Combobox.Chips
          className={cn(
            controlClasses(Boolean(error)),
            'flex min-h-10 flex-wrap items-center gap-1',
          )}
        >
          {selected.map((opt) => (
            <Combobox.Chip
              key={opt.value}
              className="flex items-center gap-1 rounded bg-brand/10 py-0.5 pr-1 pl-2 text-brand text-xs dark:text-indigo-300"
            >
              {opt.label}
              <Combobox.ChipRemove
                aria-label={`Remove ${opt.label}`}
                className="rounded p-0.5 hover:bg-brand/20"
              >
                <IconX size={12} />
              </Combobox.ChipRemove>
            </Combobox.Chip>
          ))}
          <Combobox.Input
            placeholder={selected.length === 0 ? placeholder : undefined}
            className="min-w-16 flex-1 bg-transparent text-primary text-sm outline-none placeholder:text-muted"
          />
        </Combobox.Chips>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50">
            <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border-fancy-pants bg-white p-1 shadow-lg dark:bg-zinc-900">
              <Combobox.Empty className="px-3 py-2 text-secondary text-sm empty:hidden">
                Nothing found
              </Combobox.Empty>
              <Combobox.List>
                {(item: SelectOption) => (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    className="flex cursor-default items-center justify-between rounded px-3 py-1.5 text-primary text-sm data-[highlighted]:bg-brand/10"
                  >
                    {item.label}
                    <Combobox.ItemIndicator>
                      <IconCheck size={14} className="text-brand" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </InputWrapper>
  );
}
