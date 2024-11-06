import { createFocusTrap } from 'focus-trap';

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

class DropdownMenu extends HTMLElement {
  controller = new AbortController();
  index = 0;
  items: HTMLElement[] = [];

  constructor() {
    super();

    const trap = createFocusTrap(this);

    const keydownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        return this.hidePopover();
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.index += 1;

        if (this.index >= this.items.length) {
          this.index = 0;
        }

        this.items[this.index].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.index -= 1;

        if (this.index < 0) {
          this.index = this.items.length - 1;
        }

        this.items[this.index].focus();
      }
    };

    this?.addEventListener('toggle', (event) => {
      if (event.newState === 'open') {
        trap.activate();
        this.index = 0;
        this.items = Array.from(this.querySelectorAll('.item'));
        document.addEventListener('keydown', keydownHandler, {
          signal: this.controller.signal,
        });
      } else {
        trap.deactivate();
        document.removeEventListener('keydown', keydownHandler);
      }
    });

    if (!('anchorName' in document.documentElement.style)) {
      import('@oddbird/css-anchor-positioning/fn').then(
        ({ default: polyfill }) => {
          polyfill({ elements: [this] });
        },
      );
    }
  }

  disconnectedCallback() {
    this.controller.abort();
  }
}

customElements.define('lc-dropdown-menu', DropdownMenu);
