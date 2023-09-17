import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      transitionTimingFunction: {
        'in-expo': 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
    },
    fontFamily: {
      sans: ['InterVariable', 'sans-serif'],
      serif: ['serif'],
      mono: ['Roboto MonoVariable', 'monospace'],
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

export default config;
