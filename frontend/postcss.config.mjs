// PostCSS processes CSS files during the build; this tells it to run Tailwind,
// which understands @import "tailwindcss" and @theme in globals.css
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
