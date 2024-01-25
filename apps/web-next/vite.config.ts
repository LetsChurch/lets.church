import { defineConfig } from '@solidjs/start/config';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import solidSvg from 'vite-plugin-solid-svg';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import pkg from '@vinxi/plugin-mdx';

const { default: mdx } = pkg;

export default defineConfig({
  start: {
    extensions: ['mdx', 'md'],
    server: {
      // baseURL: 'http://localhost:4004/', // TODO: this somehow controls the dev websocket
    },
  },
  plugins: [
    mdx.withImports({})({
      jsx: true,
      jsxImportSource: 'solid-js',
      providerImportSource: 'solid-mdx',
    }),
    solidSvg({ svgo: { svgoConfig: { removeViewBox: false } } }),
  ],
});
