import { defineConfig } from '@solidjs/start/config';
import solidSvg from 'vite-plugin-solid-svg';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error:
import pkg from '@vinxi/plugin-mdx';

const { default: mdx } = pkg;

const hmrPortEnv = process.env['INTERNAL_WEB_HMR_PORT'];

export default defineConfig({
  extensions: ['mdx', 'md'],
  vite: {
    server: {
      ...(hmrPortEnv
        ? {
            hmr: {
              port: parseInt(hmrPortEnv),
            },
          }
        : {}),
    },
    plugins: [
      mdx.withImports({})({
        jsx: true,
        jsxImportSource: 'solid-js',
        providerImportSource: 'solid-mdx',
      }),
      solidSvg({
        svgo: {
          svgoConfig: {
            plugins: [
              {
                name: 'preset-default',
                params: {
                  overrides: {
                    removeViewBox: false,
                  },
                },
              },
            ],
          },
        },
      }),
    ],
  },
});
