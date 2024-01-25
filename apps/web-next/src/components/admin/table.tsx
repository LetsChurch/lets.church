import { For, JSX } from 'solid-js';
import { cn } from '~/util';

export type Props<T> = {
  columns: Array<{
    title: string;
    titleSrOnly?: boolean;
    render: (t: T) => JSX.Element;
    headerClass?: string;
    cellClass?: string;
  }>;
  data: Array<T>;
};

export default function Table<T>(props: Props<T>) {
  return (
    <table class="min-w-full divide-y divide-gray-300">
      <thead>
        <tr>
          <For each={props.columns}>
            {(column, index) => (
              <th
                scope="col"
                class={cn(
                  'py-3.5 text-left text-sm font-semibold text-gray-900',
                  index() === 0 ? 'pl-4 pr-3 sm:pl-0' : 'px-3',
                  column.headerClass,
                )}
              >
                <span class={cn(column.titleSrOnly ? 'sr-only' : null)}>
                  {column.title}
                </span>
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200">
        <For each={props.data}>
          {(row) => (
            <tr>
              <For each={props.columns}>
                {(column, index) => (
                  <td
                    class={cn(
                      'whitespace-nowrap px-3 py-4 text-sm',
                      index() === 0
                        ? 'pl-4 pr-3 font-medium text-gray-900 sm:pl-0'
                        : 'text-gray-500',
                    )}
                  >
                    {column.render(row)}
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
