import { clientOnly } from '@solidjs/start';
import { ComponentProps } from 'solid-js';
import type ClientComp from './client';

const Client = clientOnly(async () => {
  return import('./client');
});

export function Turnstile(props: ComponentProps<typeof ClientComp>) {
  return <Client {...props} />;
}
