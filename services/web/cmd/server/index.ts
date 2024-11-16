import 'htmx.org';
import './components/comment-form';
import './components/dropdown-menu';
import './components/notification';
import './components/share-menu';

declare global {
  interface HTMLElement {
    addEventListener(
      type: 'toggle',
      listener: (this: Document, ev: ToggleEvent) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    popoverTargetElement: HTMLElement | null;
  }
}

document.documentElement.classList.replace('no-js', 'js');

document.body.addEventListener('flash', (e) => {
  if (
    !(e instanceof CustomEvent) ||
    !('html' in e.detail) ||
    typeof e.detail.html !== 'string'
  ) {
    return;
  }

  console.log(e.detail.html);
  document.body.insertAdjacentHTML('beforeend', e.detail.html);
});
