/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  jsxSingleQuote: true,
  semi: true,
  printWidth: 100,
  trailingComma: 'es5',
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
