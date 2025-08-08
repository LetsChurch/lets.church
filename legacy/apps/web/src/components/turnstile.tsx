import { type JSX, onMount, splitProps } from 'solid-js';
import invariant from 'tiny-invariant';
import type { Optional } from '~/util';

type Turnstile = {
  render: (
    element: string | HTMLElement,
    options: {
      sitekey: string;
      test?: boolean;
      theme?: Optional<'light' | 'dark' | 'auto'>;
      size?: Optional<'normal' | 'compact'>;
    },
  ) => string;
};

declare global {
  interface Window {
    onloadTurnstileCallback?: (() => void) | undefined;
    turnstile: Turnstile;
  }
}

let scriptEl: HTMLScriptElement | undefined;

export function Turnstile(
  props: { size?: 'normal' | 'compact' } & JSX.HTMLAttributes<HTMLDivElement>,
) {
  const [localProps, otherProps] = splitProps(props, ['size']);

  let element: HTMLDivElement;

  const ready = () => {
    invariant(element);
    window.onloadTurnstileCallback = undefined;
    window.turnstile.render(element, {
      sitekey: import.meta.env['VITE_TURNSTILE_SITEKEY'],
      theme: 'light',
      size: localProps.size,
    });
  };

  onMount(() => {
    if (scriptEl) return ready();
    scriptEl = document.createElement('script');
    scriptEl.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback';
    scriptEl.async = true;
    scriptEl.defer = true;
    document.head.appendChild(scriptEl);
    window.onloadTurnstileCallback = ready;
  });

  return <div {...otherProps} ref={(el) => void (element = el)} />;
}
