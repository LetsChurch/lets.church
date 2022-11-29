/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
    fontFamily: {
      sans: ['InterVariable', 'sans-serif'],
      serif: ['serif'],
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
