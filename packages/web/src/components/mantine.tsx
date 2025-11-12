import {
  Button,
  Checkbox,
  LoadingOverlay,
  MultiSelect,
  PasswordInput,
  Radio,
  Select,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';
import { Turnstile } from '@marsidev/react-turnstile';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type { ComponentProps } from 'react';

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

function TextInputField(
  props: Pick<
    ComponentProps<typeof TextInput>,
    'label' | 'placeholder' | 'type' | 'required'
  >,
) {
  const field = useFieldContext<string>();

  return (
    <TextInput
      {...props}
      radius="md"
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function PasswordInputField(
  props: Pick<
    ComponentProps<typeof PasswordInput>,
    'label' | 'placeholder' | 'required'
  >,
) {
  const field = useFieldContext<string>();

  return (
    <PasswordInput
      {...props}
      radius="md"
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function CheckboxField(
  props: Pick<ComponentProps<typeof Checkbox>, 'label' | 'required'>,
) {
  const field = useFieldContext<boolean>();

  return (
    <Checkbox
      {...props}
      name={field.name}
      checked={field.state.value}
      onChange={(e) => field.handleChange(e.currentTarget.checked)}
      onBlur={field.handleBlur}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" radius="xl" disabled={isSubmitting}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

function TextareaField(
  props: Pick<
    ComponentProps<typeof Textarea>,
    'label' | 'placeholder' | 'required' | 'minRows' | 'maxRows' | 'autosize'
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
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function SelectField(
  props: Pick<ComponentProps<typeof Select>, 'label' | 'data' | 'required'>,
) {
  const field = useFieldContext<string>();

  return (
    <Select
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value || '')}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
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
      name={field.name}
      value={field.state.value || []}
      onBlur={field.handleBlur}
      onChange={(value) => field.handleChange(value)}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function RadioGroupField(
  props: Pick<ComponentProps<typeof Radio.Group>, 'children'>,
) {
  const field = useFieldContext<string>();

  return (
    <Radio.Group
      {...props}
      name={field.name}
      value={field.state.value}
      onChange={(value) => field.handleChange(value)}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function DateTimePickerField(
  props: Pick<ComponentProps<typeof DateTimePicker>, 'label' | 'description'>,
) {
  const field = useFieldContext<Date>();

  return (
    <DateTimePicker
      {...props}
      name={field.name}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(value) => {
        const dateValue = value
          ? typeof value === 'string'
            ? new Date(value)
            : value
          : new Date();
        field.handleChange(dateValue);
      }}
      error={
        field.state.meta.errors?.[0]
          ? typeof field.state.meta.errors[0] === 'string'
            ? field.state.meta.errors[0]
            : field.state.meta.errors[0]?.message
          : undefined
      }
    />
  );
}

function TurnstileField(
  props: Omit<ComponentProps<typeof Turnstile>, 'onSuccess'>,
) {
  const field = useFieldContext<string>();

  return <Turnstile {...props} onSuccess={field.setValue} />;
}

function SubmittingOverlay(props: ComponentProps<typeof LoadingOverlay>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => <LoadingOverlay visible={isSubmitting} {...props} />}
    </form.Subscribe>
  );
}

export const { useAppForm: useAppMantineForm } = createFormHook({
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
    DateTimePickerField,
    TurnstileField,
  },
  formComponents: {
    SubmitButton,
    SubmittingOverlay,
  },
});
