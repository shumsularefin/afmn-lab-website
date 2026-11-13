/** @type {import('tailwindcss').Config} */
// macOS / iOS look: the system font, Apple's system colors and neutral grays. The app's classes use
// `indigo` as the accent and `slate` as the gray, so remapping those two palettes restyles every page.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Inter', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Monaco', '"Cascadia Mono"', 'monospace'],
      },
      colors: {
        // systemBlue
        indigo: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#b5d8ff', 300: '#80bcff', 400: '#4a9dff',
          500: '#0a84ff', 600: '#007aff', 700: '#0062cc', 800: '#004c9e', 900: '#003b7a', 950: '#00254d',
        },
        // Neutral system grays (light: #f5f5f7 window, dark: #1c1c1e / #2c2c2e controls)
        slate: {
          50: '#f5f5f7', 100: '#ececef', 200: '#dedee3', 300: '#c7c7cc', 400: '#a1a1a6', 500: '#86868b',
          600: '#6e6e73', 700: '#48484a', 800: '#2c2c2e', 900: '#1f1f21', 950: '#161618',
        },
        // systemGreen / Red / Orange / Purple / Teal
        emerald: {
          50: '#ebfaef', 100: '#d3f5dc', 200: '#a8eab9', 300: '#6fdb8c', 400: '#3fcf68', 500: '#34c759',
          600: '#28a745', 700: '#1f8a39', 800: '#196d2e', 900: '#135224', 950: '#0a2e14',
        },
        rose: {
          50: '#fff0ef', 100: '#ffdcda', 200: '#ffb8b4', 300: '#ff8a84', 400: '#ff5f57', 500: '#ff3b30',
          600: '#e0281d', 700: '#b81f16', 800: '#8f1a13', 900: '#6b1510', 950: '#3d0907',
        },
        orange: {
          50: '#fff6eb', 100: '#ffebd0', 200: '#ffd59f', 300: '#ffbb63', 400: '#ffa733', 500: '#ff9500',
          600: '#e07f00', 700: '#b86500', 800: '#8f4f00', 900: '#6b3b00', 950: '#3d2200',
        },
        violet: {
          50: '#f8f0fc', 100: '#f0dff9', 200: '#e2c0f2', 300: '#cf96e9', 400: '#bf6fe2', 500: '#af52de',
          600: '#9a3ccb', 700: '#7e2ea8', 800: '#632586', 900: '#4b1c66', 950: '#2b0f3b',
        },
        sky: {
          50: '#ecf9ff', 100: '#d4f1ff', 200: '#a9e3ff', 300: '#73d1fb', 400: '#40c0f5', 500: '#32ade6',
          600: '#1993cc', 700: '#1276a6', 800: '#0f5d82', 900: '#0c4762', 950: '#062a3b',
        },
      },
      boxShadow: {
        window: '0 0 0 0.5px rgba(0,0,0,.18), 0 22px 70px 4px rgba(0,0,0,.28)',
        'window-dark': '0 0 0 0.5px rgba(255,255,255,.12), 0 22px 70px 4px rgba(0,0,0,.6)',
        control: '0 0.5px 1px rgba(0,0,0,.12), 0 0 0 0.5px rgba(0,0,0,.08)',
        card: '0 0.5px 1px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04)',
        sheet: '0 0 0 0.5px rgba(0,0,0,.12), 0 30px 80px rgba(0,0,0,.3)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'zoom-in': { from: { opacity: 0, transform: 'scale(.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'slide-down': { from: { opacity: 0, transform: 'translateY(-12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'zoom-in': 'zoom-in .2s cubic-bezier(.2,.9,.3,1.2)',
        'sheet-up': 'sheet-up .32s cubic-bezier(.32,.72,0,1)',
        'slide-down': 'slide-down .28s cubic-bezier(.2,.9,.3,1)',
      },
    },
  },
  plugins: [],
};
