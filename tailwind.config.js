/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        blush: '#fdf4f9',
        lavender: '#f0f4ff',
        'idol-pink': '#e879a0',
        'idol-purple': '#7c6cf2',
        'idol-mint': '#4ade80',
        'idol-sky': '#60a5fa',
        'sakura': '#f9d1e0',
        'petal': '#fce4ef',
      },
      fontFamily: {
        sans: ['Shippori Mincho', 'Noto Sans JP', 'sans-serif'],
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
