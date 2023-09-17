import solid from 'solid-start/vite';
import solidSvg from 'vite-plugin-solid-svg';
import { defineConfig } from 'vite';
import mdx from '@mdx-js/rollup';
// import ssCloudflare from 'solid-start-cloudflare-pages';

export default defineConfig((/*{ mode }*/) => ({
  plugins: [
    // solid(mode === 'build' ? { adapter: ssCloudflare({}) } : {}),
    {
      ...mdx({
        jsx: true,
        jsxImportSource: 'solid-js',
        providerImportSource: 'solid-mdx',
      }),
      enforce: 'pre' as const,
    },
    solid({
      extensions: ['.mdx', '.md'],
    }),
    solidSvg({ svgo: { svgoConfig: { removeViewBox: false } } }),
  ],
  server: {
    host: '0.0.0.0',
  },
}));
