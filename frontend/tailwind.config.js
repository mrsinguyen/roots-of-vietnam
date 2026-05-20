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
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 3px rgba(28, 25, 23, 0.06)',
        lift: '0 6px 16px -6px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
};
