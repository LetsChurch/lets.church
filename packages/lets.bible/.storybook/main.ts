import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The app's vite.config includes the TanStack Start + Nitro plugins (for SSR
  // and route-manifest generation). Storybook renders components in isolation
  // with its own memory router and doesn't build a server, and those plugins'
  // build hooks break the Storybook bundle ("multiple entries detected"). Strip
  // them here; keep Tailwind, React, and tsconfig-paths.
  viteFinal: async (viteConfig) => {
    const plugins = (viteConfig.plugins ?? []).flat(Infinity);
    viteConfig.plugins = plugins.filter((plugin) => {
      const name =
        plugin && typeof plugin === 'object' && 'name' in plugin
          ? String((plugin as { name?: string }).name)
          : '';
      return !name.includes('tanstack') && !name.includes('nitro');
    });
    return viteConfig;
  },
};

export default config;
