import {
  createUniqueId,
  mergeProps,
  Show,
  splitProps,
  type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cn, type Optional } from '~/util';

function typeToTag(type: string) {
  if (type === 'select' || type === 'textarea') {
    return type;
  }

  return 'input';
}

export default function LabeledInput(
  props: Omit<JSX.IntrinsicElements['input'], 'id'> & {
    name: string;
    label: string;
    prefix?: string;
    placeholder?: string;
    error?: Optional<string | Array<string>>;
    type?: string;
    class?: string;
    inputClass?: string;
  },
) {
  const [otherProps, inputProps] = splitProps(props, [
    'label',
    'prefix',
    'error',
    'class',
    'inputClass',
  ]);
  const merged = mergeProps({ type: 'text' }, inputProps);
  const id = createUniqueId();

  return (
    <div class={otherProps.class}>
      <label for={id} class="mb-1 block text-sm font-medium text-gray-700">
        {otherProps.label}
      </label>
      <div
        class={
          'flex rounded-md shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600'
        }
      >
        <Show when={props.prefix}>
          <span class="flex select-none items-center pl-3 text-gray-500 sm:text-sm">
            {otherProps.prefix}
          </span>
        </Show>
        <Dynamic
          component={typeToTag(merged.type)}
          id={id}
          placeholder={merged.placeholder ?? otherProps.label}
          aria-invalid={Boolean(props.error)}
          {...merged}
          class={cn(
            'block flex-1 border-0 bg-transparent py-1.5 pl-1 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm sm:leading-6',
            otherProps.prefix ? null : 'pl-3',
            otherProps.inputClass,
          )}
        />
      </div>
      <Show when={props.error}>
        <p role="alert" class="mt-1 text-sm font-bold text-red-600">
          {props.error}
        </p>
      </Show>
    </div>
  );
}
