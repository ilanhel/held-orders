import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      direction: ['rtl'],
      fontFamily: {
        sans: ['var(--font-system-ui)', 'system-ui', 'sans-serif'],
      },
      colors: {
        held: {
          primary: '#ef4444',
          secondary: '#f97316',
        },
      },
    },
  },
  plugins: [],
}
export default config
