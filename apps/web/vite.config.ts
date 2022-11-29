import solid from 'solid-start/vite';
import solidSvg from 'vite-plugin-solid-svg';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [solid(), solidSvg()],
  server: {
    host: '0.0.0.0',
  },
});
