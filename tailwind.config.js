/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { fontFamily: { titel: ['"Bebas Neue"', 'Impact', 'sans-serif'], text: ['Inter', 'system-ui', 'sans-serif'] } } },
};
