import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    // Storybook inherits the app's Vite config. TanStack Start and Nitro own the
    // application build graph and must not process Storybook's separate entries.
    const plugins = (viteConfig.plugins ?? []).flat(4).filter((plugin) => {
      if (!plugin || Array.isArray(plugin) || !('name' in plugin)) return true;
      const name = plugin.name ?? '';
      return !(
        name.startsWith('tanstack-start') ||
        name.startsWith('tanstack-router') ||
        name.startsWith('tanstack:router') ||
        name === 'start-client-tree-plugin' ||
        name === 'tanstack-nitro-v2-vite-plugin' ||
        name === 'virtual-bundle'
      );
    });

    return { ...viteConfig, plugins };
  },
};
export default config;
