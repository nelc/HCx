/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5fa',
          100: '#dce8f3',
          200: '#bdd3e9',
          300: '#93b7d9',
          400: '#6394c5',
          500: '#4577af',
          600: '#375f94',
          700: '#0e395e', // Main brand color
          800: '#2d4a6e',
          900: '#293f5c',
          950: '#1b293d',
        },
        accent: {
          50: '#fef7ee',
          100: '#fdedd6',
          200: '#fad7ac',
          300: '#f6bb78',
          400: '#f19642',
          500: '#ed7a1e',
          600: '#de6114',
          700: '#b84a13',
          800: '#933b17',
          900: '#773316',
          950: '#40180a',
        },
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
        }
      },
      fontFamily: {
        'arabic': ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
        'display': ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-pattern': 'linear-gradient(135deg, #0e395e 0%, #1b4a7a 50%, #0e395e 100%)',
        'card-gradient': 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(14,57,94,0.03) 100%)',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(14, 57, 94, 0.07), 0 10px 20px -2px rgba(14, 57, 94, 0.04)',
        'card': '0 1px 3px rgba(14, 57, 94, 0.05), 0 1px 2px rgba(14, 57, 94, 0.1)',
        'card-hover': '0 10px 40px -15px rgba(14, 57, 94, 0.15)',
      }
    },
  },
  plugins: [],
}

