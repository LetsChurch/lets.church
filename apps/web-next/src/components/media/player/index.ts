import { clientOnly } from '@solidjs/start';

const Player = clientOnly(async () => {
  return import('./player');
});

export default Player;
