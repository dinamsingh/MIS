/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Geist as the primary UI typeface (reference template), Inter fallback.
        sans: [
          'Geist',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // ---- Reference template palette (shadcn neutral), adapted to Tailwind v3 ----
        // Surfaces & borders
        background: '#ffffff',
        surface: '#ffffff',
        border: '#ebebeb',
        input: '#ebebeb',
        ring: '#b5b5b5',
        // Primary accent is the near-black neutral primary from the reference.
        accent: {
          DEFAULT: '#343434',
          hover: '#242424',
          tint: '#f7f7f7',
        },
        // Secondary / muted neutral surfaces
        secondary: '#f7f7f7',
        // Text emphasis levels (foreground / soft / muted)
        text: {
          DEFAULT: '#252525',
          soft: '#5c5c5c',
          muted: '#8e8e8e',
        },
        // Status colors (functional indicators — kept stable)
        status: {
          green: '#12b886',
          amber: '#f59e0b',
          red: '#f0506e',
          blue: '#4c8dff',
        },
        destructive: '#e54848',
        // Left navigation surface (reference sidebar tokens)
        sidebar: {
          DEFAULT: '#fbfbfb',
          foreground: '#252525',
          border: '#ebebeb',
          accent: '#f7f7f7',
        },
        // Chart palette (reference chart-1..5)
        chart: {
          1: '#e76e50',
          2: '#2a9d90',
          3: '#34556b',
          4: '#e8c468',
          5: '#f4a259',
        },
      },
      borderRadius: {
        // Reference radius scale (--radius: 0.625rem ≈ 10px)
        card: '14px',
        button: '8px',
      },
      boxShadow: {
        // Subtle, flat shadow in the reference style (borders do most of the work)
        soft: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [],
};
