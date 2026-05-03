import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        serif: ['var(--font-baskerville)', 'Libre Baskerville', 'serif'],
      },
      colors: {
        kepler: {
          black: '#111',
          white: '#fff',
          gray: '#e5e5e5',
        },
      },
    },
  },
  plugins: [],
};
export default config;
