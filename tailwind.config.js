/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brain: {
          dark: '#1C1C1E',
          card: '#2C2C2E',
          accent: '#7F77DD',
          'accent-hover': '#6B63C4',
          'accent-soft': '#EEEDFE',
          surface: '#F7F6F3',
          'surface-hover': '#EEEDEA',
          border: '#E5E3DC',
          'border-dark': '#3A3A3C',
          muted: '#8E8E93',
          success: '#1D9E75',
          'success-bg': '#D4F0E4',
          warning: '#E0A020',
          'warning-bg': '#FEF3DC',
          error: '#D06040',
          'error-bg': '#FDE8E0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        'topbar': '48px',
        'sidebar-l': '220px',
        'sidebar-r': '240px',
      },
    },
  },
  plugins: [],
};
