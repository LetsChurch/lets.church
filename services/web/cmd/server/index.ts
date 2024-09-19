import 'htmx.org';
import './components/notification';

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
