import { type ComponentProps, Show, splitProps } from 'solid-js';
import { A } from 'solid-start';
import ExternalLink from '../external-link';
import { cn } from '~/util';

export type Props = ComponentProps<typeof A>;

export default function ContentLink(props: Props) {
  const [localProps, restProps] = splitProps(props, ['class', 'href']);

  return (
    <Show
      when={!/^(https?|mailto):/.test(localProps.href)}
      fallback={<ExternalLink href={localProps.href} {...restProps} />}
    >
      <A
        class={cn('text-indigo-500', localProps.class)}
        href={localProps.href}
        {...restProps}
      />
    </Show>
  );
}
