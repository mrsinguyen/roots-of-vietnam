/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bark: {
          50: '#fbf6ef',
          100: '#f3e7d5',
          200: '#e3c8a2',
          300: '#cfa471',
          400: '#b27e44',
          500: '#92602e',
          600: '#7c2d12',
          700: '#5e2110',
          800: '#41170b',
          900: '#2a0f07',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
