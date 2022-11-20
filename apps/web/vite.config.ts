import { sveltekit } from '@sveltejs/kit/vite';
import svg from '@poppanator/sveltekit-svg';
import type { UserConfig } from 'vite';
import { join } from 'path';

const config: UserConfig = {
  plugins: [sveltekit(), svg()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  resolve: {
    alias: {
      '~': join(__dirname, 'src'),
    },
  },
};

export default config;
