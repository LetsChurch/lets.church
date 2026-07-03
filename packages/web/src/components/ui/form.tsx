import { Turnstile } from '@marsidev/react-turnstile';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type { ComponentProps } from 'react';
import { Button } from './button';
import { LoadingOverlay } from './feedback';
import {
  Checkbox,
  InputWrapper,
  MultiSelect,
  PasswordInput,
  RadioGroup,
  Select,
  Textarea,
  TextInput,
} from './input';

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

// Pull the first error out of a TanStack Form field, whether it's a plain
// string or a `{ message }` object (e.g. from a Zod/Valibot adapter).
function fieldError(errors: unknown[] | undefined): string | undefined {
  const first = errors?.[0];
  if (!first) return undefined;
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && 'message' in first) {
    return (first as { message?: string }).message;
  }
  return undefined;
}

function TextInputField(
  props: Pick<
    ComponentProps<typeof TextInput>,
    | 'label'
    | 'placeholder'
    | 'type'
    | 'required'
    | 'description'
    | 'leftSection'
  >,
) {
  const field = useFieldContext<string>();
  return (
    <TextInput
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function PasswordInputField(
  props: Pick<
    ComponentProps<typeof PasswordInput>,
    'label' | 'placeholder' | 'required' | 'description'
  >,
) {
  const field = useFieldContext<string>();
  return (
    <PasswordInput
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function CheckboxField(
  props: Pick<
    ComponentProps<typeof Checkbox>,
    'label' | 'required' | 'description'
  >,
) {
  const field = useFieldContext<boolean>();
  return (
    <Checkbox
      {...props}
      name={field.name}
      checked={field.state.value}
      onChange={(checked) => field.handleChange(checked)}
      onBlur={field.handleBlur}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function TextareaField(
  props: Pick<
    ComponentProps<typeof Textarea>,
    | 'label'
    | 'placeholder'
    | 'required'
    | 'minRows'
    | 'maxRows'
    | 'autosize'
    | 'description'
  >,
) {
  const field = useFieldContext<string>();
  return (
    <Textarea
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function SelectField(
  props: Pick<
    ComponentProps<typeof Select>,
    'label' | 'data' | 'required' | 'placeholder' | 'description'
  >,
) {
  const field = useFieldContext<string>();
  return (
    <Select
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value)}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function MultiSelectField(
  props: Pick<
    ComponentProps<typeof MultiSelect>,
    'label' | 'data' | 'required' | 'searchable' | 'placeholder' | 'description'
  >,
) {
  const field = useFieldContext<string[]>();
  return (
    <MultiSelect
      {...props}
      value={field.state.value || []}
      onChange={(value) => field.handleChange(value)}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function RadioGroupField(
  props: Pick<
    ComponentProps<typeof RadioGroup>,
    'children' | 'label' | 'description' | 'required'
  >,
) {
  const field = useFieldContext<string>();
  return (
    <RadioGroup
      {...props}
      name={field.name}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      onBlur={field.handleBlur}
      error={fieldError(field.state.meta.errors)}
    />
  );
}

function DatePickerField(props: {
  label?: string;
  description?: string;
  // Accepted for Mantine API parity; not meaningful for the native date input.
  valueFormat?: string;
  firstDayOfWeek?: number;
  weekendDays?: number[];
}) {
  const field = useFieldContext<Date>();

  const toInputValue = (date: Date | null | undefined): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  return (
    <InputWrapper
      label={props.label}
      description={props.description}
      error={fieldError(field.state.meta.errors)}
    >
      <input
        type="date"
        name={field.name}
        value={toInputValue(field.state.value)}
        onBlur={field.handleBlur}
        onChange={(e) =>
          field.handleChange(
            e.target.value ? new Date(e.target.value) : new Date(),
          )
        }
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-primary text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/25 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </InputWrapper>
  );
}

function TurnstileField(
  props: Omit<ComponentProps<typeof Turnstile>, 'onSuccess'>,
) {
  const field = useFieldContext<string>();
  return <Turnstile {...props} onSuccess={field.setValue} />;
}

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" loading={isSubmitting}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

function SubmittingOverlay(props: ComponentProps<typeof LoadingOverlay>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => <LoadingOverlay visible={isSubmitting} {...props} />}
    </form.Subscribe>
  );
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextInputField,
    PasswordInputField,
    CheckboxField,
    TextareaField,
    SelectField,
    MultiSelectField,
    RadioGroupField,
    DatePickerField,
    TurnstileField,
  },
  formComponents: {
    SubmitButton,
    SubmittingOverlay,
  },
});
