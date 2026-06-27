/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter as the primary UI typeface (Req 20.2)
        sans: [
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
      },
      colors: {
        // Surfaces & borders (Req 20.2)
        background: '#f4f5f9',
        surface: '#ffffff',
        border: '#ecedf4',
        // Accent (Req 20.3)
        accent: {
          DEFAULT: '#5b54e6',
          hover: '#4a42d4',
          tint: '#eef0fe',
        },
        // Text emphasis levels (Req 20.4)
        text: {
          DEFAULT: '#1d2030',
          soft: '#5a6072',
          muted: '#969cad',
        },
        // Status colors (Req 20.5)
        status: {
          green: '#12b886',
          amber: '#f59e0b',
          red: '#f0506e',
          blue: '#4c8dff',
        },
      },
      borderRadius: {
        // Card 16px, button 11px (Req 20.6)
        card: '16px',
        button: '11px',
      },
      boxShadow: {
        // Soft card shadow (Req 20.6)
        soft: '0 1px 2px rgba(29, 32, 48, 0.04), 0 8px 24px rgba(29, 32, 48, 0.06)',
      },
    },
  },
  plugins: [],
};
