import type { Config } from 'tailwindcss';

// Colours resolve to the CSS custom properties in app/globals.css, so every
// module's [data-module] palette (app/styles/<module>.css) re-tints utilities
// too. Indic font stack for native-script Reels/Check output.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        panel2: 'var(--panel2)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        brand: 'var(--brand)',
        brand2: 'var(--brand2)',
        good: 'var(--good)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
        chip: 'var(--chip)',
      },
      borderRadius: { card: '14px' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'Roboto', 'Arial', 'sans-serif'],
        indic: ['Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Kannada', 'Noto Sans Bengali', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi', 'Noto Sans Malayalam', 'sans-serif'],
      },
      keyframes: {
        fade: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: { fade: 'fade .25s ease', spin: 'spin .7s linear infinite' },
    },
  },
  plugins: [],
};
export default config;
