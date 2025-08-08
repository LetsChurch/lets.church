import bSearch from 'binary-search';

const activeClass = 'lc-media__content__transcript__segment--active';

class LcTranscript extends HTMLElement {
  abortController: AbortController | null = null;

  constructor() {
    super();

    this.addEventListener('click', (e) => {
      if (!(e.target instanceof HTMLElement)) {
        return;
      }

      const closest = e.target.closest('[data-start]');

      if (!(closest instanceof HTMLElement)) {
        return;
      }

      const start = closest.dataset.start;

      if (!start) {
        return;
      }

      document.dispatchEvent(
        new CustomEvent('lc:player:seek', { detail: parseInt(start, 10) }),
      );
    });
  }

  connectedCallback() {
    const ac = (this.abortController = new AbortController());
    const starts = Array.from(this.querySelectorAll('[data-start]'))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .map((el: HTMLElement) => parseInt(el.dataset.start ?? '0', 10));

    let lastEl: HTMLElement | null = null;

    document.addEventListener(
      'lc:player:timeupdate',
      (e) => {
        if (!('detail' in e) || typeof e.detail !== 'number') {
          return;
        }

        const found = bSearch(
          starts,
          e.detail,
          (start, currentTime) => start - currentTime,
        );

        const i = found < 0 ? -found - 2 : found;

        const start = starts[i];
        const el = this.querySelector(`[data-start="${start}"]`);

        if (
          el === lastEl ||
          !(el instanceof HTMLElement) ||
          !el?.parentElement
        ) {
          return;
        }

        lastEl?.classList.remove(activeClass);
        el.classList.add(activeClass);

        // scrollIntoView causes the entire viewport to scroll, which can be jarring while entering comments
        // Instead, we scroll the parent element to the top of the element, and we additionally scroll in such a way
        // that the element is offset from the top

        el.parentElement.scrollTop = Math.max(
          el.offsetTop - el.parentElement.offsetTop - el.clientHeight,
          0,
        );

        lastEl = el;
      },
      {
        signal: ac.signal,
      },
    );
  }

  disconnectedCallback() {
    this.abortController?.abort();
  }
}

customElements.define('lc-transcript', LcTranscript);
