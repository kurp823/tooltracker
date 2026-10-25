/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Sidebar / chrome — matches the operations platform look of the
        // previous app: deep navy shell with amber accents.
        navy: {
          700: '#1b3a5c',
          800: '#143152',
          850: '#102944',
          900: '#0f2440',
          950: '#0b1c33',
        },
        accent: {
          300: '#fbd38d',
          400: '#f6ad55',
          500: '#f0b429',
          600: '#d69e2e',
          700: '#b7791f',
        },
        canvas: '#dfe5ef',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
