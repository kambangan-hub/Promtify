```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1e293b', // Warna kustom untuk background kartu
          950: '#0f172a',
        }
      }
    },
  },
  plugins: [],
}

```
