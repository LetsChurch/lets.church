import HCaptcha from '@hcaptcha/react-hcaptcha';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';

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
  const id = useId();

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
      htmlFor={id}
    >
      <input
        id={id}
        type="date"
        name={field.name}
        value={toInputValue(field.state.value)}
        onBlur={field.handleBlur}
        onChange={(e) =>
          field.handleChange(
            e.target.value ? new Date(e.target.value) : new Date(),
          )
        }
        className="text-primary focus:border-brand focus:ring-brand/25 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors outline-none focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
      />
    </InputWrapper>
  );
}

// The viewer's timezone as a readable name ("Eastern Daylight Time") for the
// given instant, so DST matches the date being picked.
function localTimeZoneName(date: Date | null | undefined): string | null {
  return (
    new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' })
      .formatToParts(date ?? new Date())
      .find((part) => part.type === 'timeZoneName')?.value ?? null
  );
}

// Local date + time picker (native datetime-local) for a nullable Date. The
// value is shown in the viewer's timezone, which the server doesn't know, so
// the input stays empty until mount to keep SSR and hydration in agreement.
function DateTimePickerField(props: {
  label?: string;
  description?: string;
  required?: boolean;
}) {
  const field = useFieldContext<Date | null>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toInputValue = (date: Date | null | undefined): string => {
    if (!mounted || !date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    // Shift into local time, then format as YYYY-MM-DDTHH:mm.
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  };
  const timeZone = mounted ? localTimeZoneName(field.state.value) : null;

  return (
    <TextInput
      label={props.label}
      required={props.required}
      description={
        [
          props.description,
          timeZone ? `Times are in your local time (${timeZone}).` : null,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      type="datetime-local"
      name={field.name}
      value={toInputValue(field.state.value)}
      onBlur={field.handleBlur}
      // A datetime-local string has no zone, so Date parses it as local time.
      onChange={(e) =>
        field.handleChange(e.target.value ? new Date(e.target.value) : null)
      }
      error={fieldError(field.state.meta.errors)}
    />
  );
}

// Invisible hCaptcha has no widget to click, so the token is fetched on submit.
// Each mounted HCaptchaField registers a token getter under its form's id, and
// `submitWithCaptcha` runs it before handing off to `form.handleSubmit()`.
const captchaExecutors = new Map<string, () => Promise<void>>();
const pendingSubmits = new Map<string, Promise<void>>();

export function submitWithCaptcha(form: {
  formId: string;
  handleSubmit: () => unknown;
}) {
  // The button isn't disabled until handleSubmit runs, so a double submit while
  // the challenge is open joins the first rather than reusing its one-time token.
  const pending = pendingSubmits.get(form.formId);
  if (pending) return pending;

  const submit = (async () => {
    // If the user closes the challenge or it errors, the token stays empty and
    // the form's own validation reports the missing CAPTCHA.
    await captchaExecutors
      .get(form.formId)?.()
      .catch(() => {});
    await form.handleSubmit();
  })().finally(() => pendingSubmits.delete(form.formId));
  pendingSubmits.set(form.formId, submit);
  return submit;
}

/** hCaptcha's terms require this notice wherever the widget is invisible. */
export function HCaptchaNotice({
  className = 'text-xs text-zinc-500 dark:text-zinc-400',
}: {
  className?: string;
}) {
  return (
    <p className={className}>
      Protected by hCaptcha. Its{' '}
      <a
        href="https://www.hcaptcha.com/privacy"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Privacy Policy
      </a>{' '}
      and{' '}
      <a
        href="https://www.hcaptcha.com/terms"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Terms of Service
      </a>{' '}
      apply.
    </p>
  );
}

function HCaptchaField(
  props: Omit<
    ComponentProps<typeof HCaptcha>,
    'onVerify' | 'onExpire' | 'onError' | 'onReady' | 'size'
  >,
) {
  const field = useFieldContext<string>();
  const captchaRef = useRef<HCaptcha>(null);
  // execute() waits for the hCaptcha script, forever if it is blocked or fails
  // to load; skip it then and let validation report the missing CAPTCHA.
  const loadedRef = useRef(false);
  const formId = field.form.formId;

  // Routes clear the spent token after a server error. With no widget to
  // complete, hide the empty-token error until the next submit.
  const [clearedAtAttempt, setClearedAtAttempt] = useState(0);

  useEffect(() => {
    if (!field.state.value) {
      captchaRef.current?.resetCaptcha();
      setClearedAtAttempt(field.form.state.submissionAttempts);
    }
  }, [field.state.value]);

  useEffect(() => {
    const execute = async () => {
      if (field.state.value || !loadedRef.current || !captchaRef.current) {
        return;
      }
      const { response } = await captchaRef.current.execute({ async: true });
      field.setValue(response);
    };
    captchaExecutors.set(formId, execute);
    return () => {
      if (captchaExecutors.get(formId) === execute) {
        captchaExecutors.delete(formId);
      }
    };
  }, [field, formId]);

  // Form-level onChange schemas flag the empty token while the user is still
  // typing; with nothing visible to complete, only surface it after a submit.
  const submitted = field.form.state.submissionAttempts > clearedAtAttempt;
  const error = submitted ? fieldError(field.state.meta.errors) : undefined;

  return (
    <div>
      <HCaptcha
        {...props}
        size="invisible"
        ref={captchaRef}
        // onReady, not onLoad: onLoad only fires when this instance loads the
        // script, not when an earlier page already did.
        onReady={() => {
          loadedRef.current = true;
        }}
        onVerify={(token) => field.setValue(token)}
        // Clearing an already-empty token still counts as a change, which would
        // wipe the submit error (e.g. onError when the script fails to load).
        onExpire={() => field.state.value && field.setValue('')}
        onError={() => field.state.value && field.setValue('')}
      />
      <HCaptchaNotice />
      {error ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
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
    DateTimePickerField,
    HCaptchaField,
  },
  formComponents: {
    SubmitButton,
    SubmittingOverlay,
  },
});
