import { mergeProps } from 'solid-js';
import CircleCheckFilled from '@tabler/icons/circle-check.svg?component-solid'; // TODO: use filled variant
import X from '@tabler/icons/x.svg?component-solid';

export type Props = {
  message: string;
  onDismiss: () => unknown;
  variant?: 'success' | 'error' | 'warning';
};

export default function Alert(props: Props) {
  const mergedProps = mergeProps({ variant: 'success' }, props);

  return (
    <div class="rounded-md bg-green-50 p-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <CircleCheckFilled class="h-5 w-5 text-green-400" />
        </div>
        <div class="ml-3">
          <p class="text-sm font-medium text-green-800">
            {mergedProps.message}
          </p>
        </div>
        <div class="ml-auto pl-3">
          <div class="-mx-1.5 -my-1.5">
            <button
              type="button"
              class="inline-flex rounded-md bg-green-50 p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
              onClick={() => mergedProps.onDismiss()}
            >
              <span class="sr-only">Dismiss</span>
              <X class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
