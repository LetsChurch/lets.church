import { For, Match, splitProps, Switch } from 'solid-js';
import type { MergeExclusive } from 'type-fest';
import { A, useLocation } from '@solidjs/router';
import FloatingDiv, { type Props as FloatingDivProps } from './floating-div';

type Link = { label: string } & MergeExclusive<
  MergeExclusive<{ href: string }, { form: string; pending?: boolean }>,
  { action: () => unknown }
>;

export type Props = FloatingDivProps & {
  links: Array<Link>;
};

export default function FloatingMenu(props: Props) {
  const [local, others] = splitProps(props, ['links']);
  const loc = useLocation();

  return (
    <FloatingDiv {...others} role="menu">
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
                  onClick={() => others.onClose()}
                >
                  {l.label}
                </button>
              )}
            </Match>
          </Switch>
        )}
      </For>
    </FloatingDiv>
  );
}
