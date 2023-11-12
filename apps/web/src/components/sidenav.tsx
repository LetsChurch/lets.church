import { Component, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { A } from 'solid-start';
import { cn } from '~/util';

export type Props = {
  class?: string;
  links: Array<{
    title: string;
    href: string;
    icon: Component<{ class: string }>;
    end?: boolean;
  }>;
};

export default function Sidenav(props: Props) {
  return (
    <aside class={cn('py-16 pr-8', props.class)}>
      <nav class="space-y-1">
        <For each={props.links}>
          {({ href, title, icon, end = false }) => (
            <A
              href={href}
              class="group flex items-center rounded-sm border-l-4 border-transparent px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 hover:text-gray-900"
              activeClass="bg-gray-50 text-gray-900"
              end={end}
            >
              <Dynamic component={icon} class="mr-4 text-gray-400" />
              {title}
            </A>
          )}
        </For>
      </nav>
    </aside>
  );
}
