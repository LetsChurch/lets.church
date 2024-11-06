import { createFocusTrap } from 'focus-trap';

const windowConfig = Object.entries({
  width: 550,
  height: 400,
  location: 'no',
  toolbar: 'no',
  status: 'no',
  directories: 'no',
  menubar: 'no',
  scrollbars: 'yes',
  resizable: 'no',
  centerscreen: 'yes',
  chrome: 'yes',
})
  .map(([k, v]) => `${k}=${v}`)
  .join(',');

class ShareMenu extends HTMLElement {
  controller = new AbortController();
  index = 0;
  items: HTMLElement[] = [];

  constructor() {
    super();

    const shareData = {
      title: this.getAttribute('title') || '',
      url: location.href,
    };

    const button = document.querySelector(`[popovertarget="${this.id}"]`);

    if (button instanceof HTMLElement && navigator.canShare?.(shareData)) {
      button.popoverTargetElement = null;
      button.addEventListener('click', async () => {
        navigator.share(shareData);
      });
      return;
    }

    const trap = createFocusTrap(this);

    const keydownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        return this.hidePopover();
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.index += 1;

        if (this.index >= this.items.length) {
          this.index = 0;
        }

        this.items[this.index].focus();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.index -= 1;

        if (this.index < 0) {
          this.index = this.items.length - 1;
        }

        this.items[this.index].focus();
      }
    };

    this.addEventListener('toggle', (event) => {
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

    this.addEventListener('click', async (event) => {
      if (event.target instanceof HTMLButtonElement) {
        const action = event.target.getAttribute('data-action');
        if (action === 'facebook') {
          this.openWindow(
            `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams(
              Object.entries({
                u: shareData.url,
                quote: shareData.title,
              }),
            )}`,
          );
        } else if (action === 'x') {
          this.openWindow(
            `https://x.com/share?${new URLSearchParams(
              Object.entries({
                url: shareData.url,
                text: shareData.title,
              }),
            )}`,
          );
        } else if (action === 'copy') {
          await navigator.clipboard.writeText(
            `${shareData.title} ${shareData.url}`,
          );
          this.hidePopover();
        }
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

  openWindow(url: string) {
    window.open(url, '', windowConfig);
    this.hidePopover();
  }
}

customElements.define('lc-share-menu', ShareMenu);
