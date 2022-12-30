import type { UseFloatingResult } from 'solid-floating-ui';
import { For, JSX, Match, splitProps, Switch } from 'solid-js';
import { Portal } from 'solid-js/web';
import { A, useLocation } from 'solid-start';
import type { MergeExclusive } from 'type-fest';
import clickOutside from '~/util/click-outside';
import ShowTransition from './show-transition';

type Link = { label: string } & MergeExclusive<
  MergeExclusive<{ href: string }, { form: string; pending?: boolean }>,
  { action: () => unknown }
>;

export type Props = JSX.HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  ref: (el: HTMLDivElement) => unknown;
  onClose: () => unknown;
  position: UseFloatingResult;
  links: Array<Link>;
};

export default function FloatingMenu(props: Props) {
  const [local, others] = splitProps(props, [
    'ref',
    'open',
    'onClose',
    'position',
    'links',
    'class',
  ]);
  const loc = useLocation();

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
            class={`z-10 mt-2 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none ${local.class}`}
            role="menu"
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
          >
            <For each={local.links}>
              {(link) => (
                <Switch>
                  <Match when={'href' in link && link} keyed>
                    {(l) => (
                      <A
                        href={l.href ?? ''}
                        class="block px-4 py-2 text-sm text-gray-700"
                        class:bg-gray-100={
                          'href' in link && loc.pathname === link.href
                        }
                        role="menuitem"
                        tabindex="-1"
                      >
                        {link.label}
                      </A>
                    )}
                  </Match>
                  <Match when={'form' in link && link} keyed>
                    {(l) => (
                      <button
                        type="submit"
                        class="block px-4 py-2 text-sm text-gray-700"
                        disabled={!!l.pending}
                        form={l.form ?? ''}
                      >
                        {link.label}
                      </button>
                    )}
                  </Match>
                  <Match when={'action' in link && link} keyed>
                    {(l) => (
                      <button
                        type="button"
                        class="block px-4 py-2 text-sm text-gray-700"
                        onClick={() => local.onClose()}
                      >
                        {l.label}
                      </button>
                    )}
                  </Match>
                </Switch>
              )}
            </For>
          </div>
        </Portal>
      )}
    </ShowTransition>
  );
}
