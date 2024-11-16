class CommentForm extends HTMLElement {
  constructor() {
    super();

    const textarea = this.querySelector('textarea');

    if (!textarea) {
      return;
    }

    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.style.overflowY = 'hidden';

    function size() {
      if (!textarea) {
        return;
      }

      textarea.style.overflowY = 'hidden';
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }

    textarea.addEventListener('input', size);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        size();
      }
    });
  }
}

customElements.define('comment-form', CommentForm);
