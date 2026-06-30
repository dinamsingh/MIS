/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Tasko reference uses Geist; Inter and system fonts remain fallbacks.
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
        // Semantic tokens backed by CSS variables in src/index.css.
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
        soft: 'rgb(var(--color-text-soft) / <alpha-value>)',
        muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          tint: 'rgb(var(--color-accent-tint) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          soft: 'rgb(var(--color-text-soft) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        status: {
          green: 'rgb(var(--color-status-green) / <alpha-value>)',
          amber: 'rgb(var(--color-status-amber) / <alpha-value>)',
          red: 'rgb(var(--color-status-red) / <alpha-value>)',
          blue: 'rgb(var(--color-status-blue) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--color-sidebar) / <alpha-value>)',
          foreground: 'rgb(var(--color-sidebar-foreground) / <alpha-value>)',
          border: 'rgb(var(--color-sidebar-border) / <alpha-value>)',
          accent: 'rgb(var(--color-sidebar-accent) / <alpha-value>)',
        },
        chart: {
          1: 'rgb(var(--color-chart-1) / <alpha-value>)',
          2: 'rgb(var(--color-chart-2) / <alpha-value>)',
          3: 'rgb(var(--color-chart-3) / <alpha-value>)',
          4: 'rgb(var(--color-chart-4) / <alpha-value>)',
          5: 'rgb(var(--color-chart-5) / <alpha-value>)',
          positive: 'rgb(var(--color-chart-positive) / <alpha-value>)',
          warning: 'rgb(var(--color-chart-warning) / <alpha-value>)',
          negative: 'rgb(var(--color-chart-negative) / <alpha-value>)',
          neutral: 'rgb(var(--color-chart-neutral) / <alpha-value>)',
        },
      },
      spacing: {
        control: '2.5rem',
        touch: '2.75rem',
        section: '1.5rem',
        'section-lg': '2rem',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        button: 'var(--radius-button)',
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        dialog: 'var(--radius-dialog)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)',
        overlay: 'var(--shadow-overlay)',
        focus: 'var(--shadow-focus)',
      },
      transitionDuration: {
        fast: 'var(--motion-duration-fast)',
        DEFAULT: 'var(--motion-duration-standard)',
        slow: 'var(--motion-duration-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--motion-ease-standard)',
        entrance: 'var(--motion-ease-out)',
        exit: 'var(--motion-ease-in)',
      },
      keyframes: {
        'foundation-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'foundation-slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'foundation-scale-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'foundation-fade-in': 'foundation-fade-in var(--motion-duration-standard) var(--motion-ease-out)',
        'foundation-slide-up': 'foundation-slide-up var(--motion-duration-standard) var(--motion-ease-out)',
        'foundation-scale-in': 'foundation-scale-in var(--motion-duration-standard) var(--motion-ease-out)',
      },
    },
  },
  plugins: [],
};
