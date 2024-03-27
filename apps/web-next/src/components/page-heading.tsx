import { A } from '@solidjs/router';
import ChevronLeft from '@tabler/icons/outline/chevron-left.svg?component-solid';
import { For, mergeProps, Show } from 'solid-js';

export type Props = {
  title: string;
  backButton?: boolean;
  actions?: Array<{ variant?: 'primary'; label: string; href: string }>;
};

export function PageHeading(props: Props) {
  const local = mergeProps({ actions: [] }, props);

  return (
    <div class="mb-5 mt-2 flex items-center justify-between">
      <div class="flex min-w-0 flex-1 flex-row items-center">
        <Show when={local.backButton}>
          <A href=".." class="mr-2 text-gray-400 hover:text-gray-900">
            <ChevronLeft />
          </A>
        </Show>
        <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
          {local.title}
        </h2>
      </div>
      <div class="mt-4 flex flex-shrink-0 md:ml-4 md:mt-0">
        <For each={local.actions}>
          {(action) => (
            <A
              class={`inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 md:ml-3 ${
                action.variant === 'primary'
                  ? 'border-transparent  bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              href={action.href}
            >
              {action.label}
            </A>
          )}
        </For>
      </div>
    </div>
  );
}
