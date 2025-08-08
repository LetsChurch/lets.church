import { Show, splitProps, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import ExternalLink from '../external-link';
import { cn } from '~/util';

export default function ContentLink(props: JSX.IntrinsicElements['a']) {
  const [localProps, restProps] = splitProps(props, ['class', 'href']);

  return (
    <Show
      when={!/^(https?|mailto):/.test(localProps.href ?? '')}
      fallback={<ExternalLink href={localProps.href ?? ''} {...restProps} />}
    >
      <A
        class={cn('text-indigo-500', localProps.class)}
        href={localProps.href ?? ''}
        {...restProps}
      />
    </Show>
  );
}
