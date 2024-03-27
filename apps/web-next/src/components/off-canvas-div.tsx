import { type JSX, type ParentProps, splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import XIcon from '@tabler/icons/outline/x.svg?component-solid';
import ShowTransition from './show-transition';
import clickOutside from '~/util/click-outside';

export type Props = ParentProps<
  JSX.HTMLAttributes<HTMLDivElement> & {
    open: boolean;
    onClose: () => unknown;
  }
> & { backdropClass?: string | undefined };

export default function OffCanvasDiv(props: Props) {
  const [local, others] = splitProps(props, [
    'open',
    'onClose',
    'class',
    'backdropClass',
    'children',
    'title',
  ]);

  return (
    <>
      <ShowTransition
        when={local.open}
        classEnterBase="transition-opacity ease-linear duration-300"
        classEnterFrom="opacity-0"
        classEnterTo="opacity-100"
        classExitBase="transition-opacity ease-linear duration-300"
        classExitFrom="opacity-100"
        classExitTo="opacity-0"
      >
        {(tref) => (
          <Portal>
            <div
              class={`fixed inset-0 bg-black bg-opacity-25 ${
                local.backdropClass ?? ''
              }`}
              ref={tref}
            />
          </Portal>
        )}
      </ShowTransition>
      <ShowTransition
        when={local.open}
        classEnterBase="transition ease-in-out duration-300 transform"
        classEnterFrom="translate-x-full"
        classEnterTo="translate-x-0"
        classExitBase="transition ease-in-out duration-300 transform"
        classExitFrom="translate-x-0"
        classExitTo="translate-x-full"
      >
        {(tref) => (
          <Portal>
            <div class="fixed inset-0 z-40 flex">
              <div
                class={`relative ml-auto flex h-full w-full max-w-xs flex-col divide-y divide-gray-200 overflow-y-auto bg-white pb-6 shadow-xl [&>*]:p-4 ${
                  local.class ?? ''
                }`}
                aria-modal
                tabindex="-1"
                ref={(el) => {
                  tref(el);
                  clickOutside(el, local.onClose);
                }}
                {...others}
              >
                <div class="flex items-center justify-between p-4">
                  <h2 class="text-lg font-medium text-gray-900">
                    {local.title}
                  </h2>
                  <button
                    type="button"
                    class="-mr-2 flex h-10 w-10 items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onClick={local.onClose}
                  >
                    <span class="sr-only">Close</span>
                    <XIcon class="h-6 w-6" />
                  </button>
                </div>
                {local.children}
              </div>
            </div>
          </Portal>
        )}
      </ShowTransition>
    </>
  );
}
