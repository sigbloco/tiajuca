import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Cores vêm de CSS variables (canais RGB) definidas pelo tema da organização — nunca hex em componentes.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        header: { DEFAULT: token('header'), foreground: token('header-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        border: token('border'),
        input: token('border'),
        ring: token('primary'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('primary-foreground') },
        success: token('success'),
        warning: token('warning'),
        info: token('info'),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        display: ['"Baloo 2 Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
      },
      // Entrelinha mais justa nos tamanhos de título (o padrão do Tailwind deixa títulos de duas linhas muito espaçados).
      fontSize: {
        lg: ['1.125rem', { lineHeight: '1.3rem' }],
        xl: ['1.25rem', { lineHeight: '1.4rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.65rem' }],
        '3xl': ['1.875rem', { lineHeight: '2rem' }],
      },
      keyframes: { 'loading-bar': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(300%)' } } },
      animation: { 'loading-bar': 'loading-bar 1.3s ease-in-out infinite' },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.04)' },
    },
  },
  plugins: [animate],
} satisfies Config
