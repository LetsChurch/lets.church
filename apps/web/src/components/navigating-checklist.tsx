import { For, type JSX, splitProps } from 'solid-js';
import { useLocation, useNavigate } from 'solid-start';
import { setQueryParams } from '~/util/url';

type Link = { label: string; value: string; checked: boolean };

export type Props = JSX.IntrinsicElements['div'] & {
  options: Array<Link>;
  queryKey: string;
};

export default function NavigatingChecklist(props: Props) {
  const [local, others] = splitProps(props, ['options', 'queryKey']);
  const navigate = useNavigate();
  const loc = useLocation();

  const currentValues = () =>
    loc.query[local.queryKey]?.split(',').filter(Boolean) ?? [];

  function onChange(value: string, checked: boolean) {
    navigate(
      `?${setQueryParams(loc.search, {
        [local.queryKey ?? '']: checked
          ? [...currentValues(), value]
          : currentValues().filter((v) => v !== value),
      })}`,
    );
  }

  return (
    <div {...others} role="menu">
      <For each={local.options}>
        {(op) => (
          <div class="flex items-center px-4 py-2">
            <input
              id="filter-mobile-category-1"
              value={op.value}
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={op.checked}
              onChange={() => onChange(op.value, !op.checked)}
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
