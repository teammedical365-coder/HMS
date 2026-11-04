/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1E40AF',
          teal: '#14B8A6',
          dark: '#0F172A'
        }
      }
    },
  },
  plugins: [],
};

