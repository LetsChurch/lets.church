import { For, type JSX, splitProps } from 'solid-js';
import { useLocation, useNavigate } from 'solid-start';
import { setQueryParams } from '~/util/url';

type Link = { label: string; queryKey: string; checked: boolean };

export type Props = JSX.IntrinsicElements['div'] & {
  options: Array<Link>;
};

export default function NavigatingBooleans(props: Props) {
  const [local, others] = splitProps(props, ['options']);
  const navigate = useNavigate();
  const loc = useLocation();

  function onChange(queryKey: string, value: string) {
    navigate(
      `?${setQueryParams(loc.search, {
        [queryKey ?? '']: value,
      })}`,
    );
  }

  return (
    <div {...others} role="menu">
      <For each={local.options}>
        {(op) => (
          <div class="flex items-center py-2">
            <input
              id="filter-mobile-category-1"
              value="true"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              checked={op.checked}
              onChange={() =>
                onChange(op.queryKey, !op.checked ? 'true' : 'false')
              }
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
