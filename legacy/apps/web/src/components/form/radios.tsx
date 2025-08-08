import { For, Show } from 'solid-js';
import type { Optional } from '~/util';

export type Props = {
  label: string;
  id: string;
  name: string;
  options: Array<{ label: string; help?: string; value: string }>;
  value?: Optional<string>;
  disabled?: Optional<boolean>;
  onClick?: () => void;
};

export default function Radios(props: Props) {
  return (
    <fieldset>
      <legend class="contents text-base font-medium text-gray-900">
        {props.label}
      </legend>
      <div class="mt-4 space-y-4" onClick={() => props.onClick?.()}>
        <For each={props.options}>
          {(op) => (
            <div class={`flex ${op.help ? 'items-start' : 'items-center'}`}>
              <div class="flex h-5 items-center">
                <input
                  id={`${props.id}_${op.value}`}
                  {...(props.name ? { name: props.name } : {})}
                  value={op.value}
                  checked={props.value === op.value}
                  type="radio"
                  class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div class="ml-3 text-sm">
                <label
                  for={`${props.id}_${op.value}`}
                  class="font-medium text-gray-700"
                >
                  {op.label}
                </label>
                <Show when={op.help}>
                  <p class="text-gray-500">{op.help}</p>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </fieldset>
  );
}
