import { Show, type JSX } from 'solid-js';
import { A, useLocation } from 'solid-start';
import { setQueryParams } from '~/util/url';

export type Props = {
  label: JSX.Element;
  queryKey?: string;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startCursor: string;
  endCursor: string;
};

export default function Pagination(props: Props) {
  const loc = useLocation();

  return (
    <nav class="mt-6 flex items-center justify-between" aria-label="Pagination">
      <div class="hidden sm:block">
        <p class="text-sm text-gray-700">{props.label}</p>
      </div>
      <div class="flex flex-1 justify-between sm:justify-end">
        <Show when={props.hasPreviousPage}>
          <A
            href={`?${setQueryParams(loc.query, {
              [props.queryKey ? `${props.queryKey}Before` : 'before']:
                props.startCursor,
              [props.queryKey ? `${props.queryKey}After` : 'after']: null,
            })}`}
            class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous Page
          </A>
        </Show>
        <Show when={props.hasNextPage}>
          <A
            href={`?${setQueryParams(loc.query, {
              [props.queryKey ? `${props.queryKey}After` : 'after']:
                props.endCursor,
              [props.queryKey ? `${props.queryKey}Before` : 'before']: null,
            })}`}
            class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Next Page
          </A>
        </Show>
      </div>
    </nav>
  );
}
