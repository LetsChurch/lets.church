import { For, splitProps } from 'solid-js';
import FloatingDiv, { Props as FloatingDivProps } from './floating-div';

type Link = { label: string; value: string; checked: boolean };

export type Props = Omit<FloatingDivProps, 'onChange'> & {
  options: Array<Link>;
  onChange: (value: string, checked: boolean) => unknown;
};

export default function FloatingChecklist(props: Props) {
  const [local, others] = splitProps(props, ['options', 'onChange']);

  return (
    <FloatingDiv {...others} role="menu">
      <For each={local.options}>
        {(op) => (
          <div class="flex items-center px-4 py-2">
            <input
              id="filter-mobile-category-1"
              value={op.value}
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={op.checked}
              onChange={() => local.onChange(op.value, !op.checked)}
            />
            <label
              for="filter-mobile-category-1"
              class="ml-3 text-sm text-gray-500"
            >
              {op.label}
            </label>
          </div>
        )}
      </For>
    </FloatingDiv>
  );
}
