import { useLocation, useNavigate } from '@solidjs/router';
import { For, type JSX, splitProps } from 'solid-js';
import { setQueryParams } from '~/util/url';

type Link = { label: string; value: string; checked: boolean };

export type Props = JSX.IntrinsicElements['div'] & {
  options: Array<Link>;
  queryKey: string;
  radios?: boolean;
};

export default function NavigatingChecklist(props: Props) {
  const [local, others] = splitProps(props, ['options', 'queryKey', 'radios']);
  const navigate = useNavigate();
  const loc = useLocation();

  const currentValues = () =>
    loc.query[local.queryKey]?.split(',').filter(Boolean) ?? [];

  function onChange({ value, checked }: { value: string; checked: boolean }) {
    navigate(
      `?${setQueryParams(loc.search, {
        [local.queryKey ?? '']: checked
          ? local.radios
            ? value
            : [...currentValues(), value]
          : currentValues().filter((v) => v !== value),
      })}`,
    );
  }

  return (
    <div {...others} role="menu">
      <For each={local.options}>
        {(op) => (
          <div class="flex items-center py-2">
            <input
              value={op.value}
              type={local.radios ? 'radio' : 'checkbox'}
              name={local.queryKey}
              class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
              classList={{ rounded: !local.radios }}
              checked={op.checked}
              onChange={[onChange, { checked: !op.checked, value: op.value }]}
              disabled={currentValues().length > 10 && !op.checked}
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
    </div>
  );
}
