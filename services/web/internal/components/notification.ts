class LcNotification extends HTMLElement {
  abortController: AbortController | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    const { signal } = (this.abortController = new AbortController());

    document.addEventListener(
      'click',
      (e) => {
        if (e.target instanceof HTMLElement && !this.contains(e.target)) {
          this.remove();
        }
      },
      {
        capture: true,
        signal,
      },
    );

    this.querySelector('[data-close]')?.addEventListener(
      'click',
      () => this.remove(),
      {
        signal,
      },
    );
  }

  disconnectedCallback() {
    this.abortController?.abort();
  }
}

customElements.define('lc-notification', LcNotification);
