// Tailwind v4 via PostCSS. .mjs, not .js: @tailwindcss/postcss is ESM-only and
// hub/package.json is CJS. postcss-load-config loads .mjs natively, which is
// what lets vite.config.ts stay a .ts CJS file — see the comment there for why
// renaming it is not an option.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
