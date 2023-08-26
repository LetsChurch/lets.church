import solid from 'solid-start/vite';
import solidSvg from 'vite-plugin-solid-svg';
import { defineConfig } from 'vite';
// import ssCloudflare from 'solid-start-cloudflare-pages';

export default defineConfig((/*{ mode }*/) => ({
  plugins: [
    // solid(mode === 'build' ? { adapter: ssCloudflare({}) } : {}),
    solid(),
    solidSvg({ svgo: { svgoConfig: { removeViewBox: false } } }),
  ],
  server: {
    host: '0.0.0.0',
  },
}));
