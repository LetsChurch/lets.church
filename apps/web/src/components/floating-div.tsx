import type { UseFloatingResult } from 'solid-floating-ui';
import { JSX, ParentProps, splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import clickOutside from '~/util/click-outside';
import ShowTransition from './show-transition';

export type Props = ParentProps<
  JSX.HTMLAttributes<HTMLDivElement> & {
    open: boolean;
    ref: (el: HTMLDivElement) => unknown;
    onClose: () => unknown;
    position: UseFloatingResult;
  }
>;

export default function FloatingDiv(props: Props) {
  const [local, others] = splitProps(props, [
    'ref',
    'open',
    'onClose',
    'position',
    'class',
  ]);

  return (
    <ShowTransition
      when={local.open}
      classEnterBase="transition ease-out duration-100"
      classEnterFrom="transform opacity-0 scale-95"
      classEnterTo="transform opacity-100 scale-100"
      classExitBase="transition ease-in duration-75"
      classExitFrom="transform opacity-100 scale-100"
      classExitTo="transform opacity-0 scale-95"
    >
      {(tref) => (
        <Portal>
          <div
            class={`z-10 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none ${local.class}`}
            aria-orientation="vertical"
            tabindex="-1"
            ref={(el) => {
              tref(el);
              local.ref(el);
              clickOutside(el, local.onClose);
            }}
            style={{
              position: local.position.strategy,
              top: `${local.position.y ?? 0}px`,
              left: `${local.position.x ?? 0}px`,
            }}
            {...others}
          />
        </Portal>
      )}
    </ShowTransition>
  );
}
