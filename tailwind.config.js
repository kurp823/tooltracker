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
        // Measured from the previous app's running UI.
        navy: {
          700: '#24406b',
          800: '#16294a',
          850: '#0e2038',
          900: '#0b192c',   // sidebar shell
          950: '#071222',
          head: '#1a3055',  // table header row
        },
        accent: {
          50:  '#fffaeb',   // selected-row tint on the reconciliation grids
          300: '#fbd38d',
          400: '#f6ad55',
          500: '#f0b429',
          600: '#d69e2e',
          700: '#b7791f',
        },
        canvas: '#eef3f8',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
