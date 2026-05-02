/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand accent (logo cyan) — buton, focus, vurgu.
        accent: {
          DEFAULT: '#0EA5E9',
          hover: '#38BDF8',
        },
        // Brand kırmızı — record nokta.
        brand: {
          red: '#EF4444',
          cyan: '#0EA5E9',
        },
        // Semantic token'lar — globals.css içindeki CSS değişkenlerinden
        // beslenir. .dark / .light class'ı <html>'e geçince paletin tamamı
        // otomatik değişir. <alpha-value> Tailwind'in opacity desteği.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
          hover: 'rgb(var(--surface-hover) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        canvas: {
          DEFAULT: 'rgb(var(--canvas-bg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'scale-in': 'scaleIn 120ms ease-out',
        'progress-indeterminate': 'progressIndeterminate 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        progressIndeterminate: {
          '0%': { transform: 'translateX(-100%) scaleX(0.3)' },
          '40%': { transform: 'translateX(0%) scaleX(0.6)' },
          '100%': { transform: 'translateX(200%) scaleX(0.3)' },
        },
      },
    },
  },
  plugins: [],
};
