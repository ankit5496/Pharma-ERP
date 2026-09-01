const { core, ignorePatterns } = require('./rules');

/**
 * ESLint config for the Next.js web app.
 *
 * Deliberately does NOT extend ./base.js. eslint-config-next brings its own
 * copy of eslint-plugin-import, and ESLint 8 refuses to run when a plugin
 * resolves to two different files — which is exactly what pnpm's nested layout
 * produces if both configs declare it. So this preset takes Next's plugins and
 * our shared rules, and skips the import/order rules for this app.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'next/core-web-vitals',
    // Must stay last so formatting rules defer to Prettier.
    'prettier',
  ],
  env: { browser: true, node: true, es2022: true },
  rules: {
    ...core,
    // Server components legitimately log during SSR.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: [...ignorePatterns, 'next-env.d.ts'],
};
