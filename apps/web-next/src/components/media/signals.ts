import { createSignal } from 'solid-js';

const [currentTime, setCurrentTime] = createSignal(0);
const [seekTime, setSeekTime] = createSignal(0);

export { currentTime, setCurrentTime };
export { seekTime, setSeekTime };

export function getStartAt() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const t = hashParams.get('t');

  if (t) {
    return parseInt(t);
  }

  return undefined;
}
