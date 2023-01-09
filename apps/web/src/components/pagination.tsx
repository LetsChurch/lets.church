import { Show, type JSX } from 'solid-js';
import { A, useLocation } from 'solid-start';

export type Props = {
  label: JSX.Element;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startCursor: string;
  endCursor: string;
};

export default function Pagination(props: Props) {
  const loc = useLocation();

  const withoutAfter = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { after, ...rest } = loc.query;

    return rest;
  };

  const withoutBefore = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { before, ...rest } = loc.query;

    return rest;
  };

  return (
    <nav class="mt-6 flex items-center justify-between" aria-label="Pagination">
      <div class="hidden sm:block">
        <p class="text-sm text-gray-700">{props.label}</p>
      </div>
      <div class="flex flex-1 justify-between sm:justify-end">
        <Show when={props.hasPreviousPage}>
          <A
            href={`?${new URLSearchParams({
              ...withoutAfter(),
              before: props.startCursor,
            })}`}
            class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous Page
          </A>
        </Show>
        <Show when={props.hasNextPage}>
          <A
            href={`?${new URLSearchParams({
              ...withoutBefore(),
              after: props.endCursor,
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
