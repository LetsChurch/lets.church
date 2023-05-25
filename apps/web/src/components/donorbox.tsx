import { JSX, onMount } from 'solid-js';
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

export function Donorbox(props: JSX.HTMLAttributes<HTMLDivElement>) {
  onMount(() => {
    if (scriptEl) return;
    scriptEl = document.createElement('script');
    scriptEl.src = 'https://donorbox.org/widget.js';
    scriptEl.async = true;
    scriptEl.defer = true;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: non-standard property
    scriptEl.paypalExpress = false;
    document.head.appendChild(scriptEl);
  });

  return (
    <div {...props}>
      <iframe
        src="https://donorbox.org/embed/let-s-church?default_interval=o&enable_auto_scroll=false"
        name="donorbox"
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: non-standard property
        allowpaymentrequest="allowpaymentrequest"
        seamless="seamless"
        frameborder="0"
        scrolling="no"
        height="900px"
        width="100%"
        style={{
          'max-width': '425px',
          'min-width': '250px',
          'max-height': 'none!important',
        }}
      />
    </div>
  );
}
