tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans TC"', 'Manrope', 'sans-serif'],
        display: ['Manrope', '"Noto Sans TC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Consolas', 'monospace'],
      },
      colors: {
        dark: {
          bg: '#081324',
          card: '#10243b',
          border: '#355374',
          accent: '#16324f',
        },
        brand: {
          primary: '#0ea5e9',
          secondary: '#22c55e',
          purple: '#f59e0b',
          success: '#16a34a',
          danger: '#dc2626',
        },
      },
    },
  },
};
