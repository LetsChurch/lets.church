/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {},
    fontFamily: {
      sans: ['InterVariable', 'sans-serif'],
      serif: ['serif'],
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
