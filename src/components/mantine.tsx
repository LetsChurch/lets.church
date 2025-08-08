import { Button, Checkbox, PasswordInput, TextInput } from '@mantine/core';
import { Turnstile } from '@marsidev/react-turnstile';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import type { ComponentProps } from 'react';

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

function TextInputField(
  props: Pick<
    ComponentProps<typeof TextInput>,
    'label' | 'placeholder' | 'required'
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
        field.state.meta.isValid ? field.state.meta.errors.join(', ') : false
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
        field.state.meta.isValid ? field.state.meta.errors.join(', ') : false
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
        field.state.meta.isValid ? field.state.meta.errors.join(', ') : false
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

function TurnstileField(
  props: Omit<ComponentProps<typeof Turnstile>, 'onSuccess'>,
) {
  const field = useFieldContext<string>();

  return <Turnstile {...props} onSuccess={field.setValue} />;
}

export const { useAppForm: useAppMantineForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextInputField,
    PasswordInputField,
    CheckboxField,
    TurnstileField,
  },
  formComponents: {
    SubmitButton,
  },
});
