/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          950: '#060A13', // Ultra-dark backdrop
          900: '#0B0F19', // Dark background
          800: '#151D30', // Deep card base
          700: '#1F2B48', // Component borders/hover
          600: '#2E3F66', // Muted steel
          400: '#64748B', // Slate text
          200: '#E2E8F0', // White/gray text
        },
        neon: {
          cyan: '#00E5FF',
          blue: '#2563EB',
          emerald: '#10B981',
          rose: '#F43F5E',
          amber: '#F59E0B',
          purple: '#A855F7',
        }
      },
      backgroundImage: {
        'radial-gradient-dark': 'radial-gradient(circle at top, #111C35 0%, #060A13 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(21, 29, 48, 0.4) 0%, rgba(11, 15, 25, 0.6) 100%)',
      },
      boxShadow: {
        'neon-glow': '0 0 15px rgba(0, 229, 255, 0.15)',
        'neon-emerald': '0 0 15px rgba(16, 185, 129, 0.2)',
        'neon-rose': '0 0 15px rgba(244, 63, 94, 0.2)',
        'glass-shadow': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        'glass': '16px',
      }
    },
  },
  plugins: [],
}
