/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pine: { DEFAULT: '#14302C', 2: '#1D3F3A', 3: '#2A544D', text: '#C9D6D2', dim: '#8FA59F' },
        paper: '#F3F4F1',
        line: '#E2E5E1',
        ink: '#1B2421',
        muted: '#65706B',
        brand: { DEFAULT: '#0F766E', dark: '#0B5E57', soft: '#E3F1EE', ring: '#0F766E33' },
        ok: { DEFAULT: '#15803D', soft: '#E4F3E8' },
        warn: { DEFAULT: '#B45309', soft: '#FBF0DF' },
        danger: { DEFAULT: '#B42318', soft: '#FBE9E7' },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(20,48,44,.05)',
        pop: '0 12px 32px rgba(20,48,44,.16)',
      },
      keyframes: {
        fade: { from: { opacity: 0 } },
        pop: { from: { opacity: 0, transform: 'translateY(8px) scale(.98)' } },
      },
      animation: { fade: 'fade .15s ease-out', pop: 'pop .18s ease-out' },
    },
  },
  plugins: [
    // Base element styles (replaces the old global CSS)
    ({ addBase, theme }) =>
      addBase({
        'html, body, #root': { height: '100%' },
        body: {
          fontFamily: '"Instrument Sans", system-ui, sans-serif',
          fontSize: '14px',
          color: theme('colors.ink'),
          backgroundColor: theme('colors.paper'),
          WebkitFontSmoothing: 'antialiased',
        },
        a: { color: theme('colors.brand.DEFAULT') },
        'a:hover': { textDecoration: 'underline' },
        'h1, h2, h3, h4': { letterSpacing: '-0.015em', color: theme('colors.ink') },
        h1: { fontSize: '26px', fontWeight: '650' },
        h2: { fontSize: '17px', fontWeight: '600' },
        h3: { fontSize: '15px', fontWeight: '600' },
        'input[type=checkbox]': { accentColor: theme('colors.brand.DEFAULT') },
        ':focus-visible': { outline: `2px solid ${theme('colors.brand.DEFAULT')}`, outlineOffset: '2px' },
        '@media (prefers-reduced-motion: reduce)': { '*': { animation: 'none !important', transition: 'none !important' } },
      }),
  ],
};
