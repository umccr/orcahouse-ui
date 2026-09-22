import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts']),
  {
    // eslint-config-next sets react.version to 'detect', which makes eslint-plugin-react
    // call the now-removed context.getFilename() under ESLint 10 and crash. Pinning the
    // version we actually depend on skips that lookup (and is exact anyway).
    settings: { react: { version: '19.3.0' } },
  },
]);
