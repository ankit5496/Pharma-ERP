const { core, importRules, ignorePatterns } = require('./rules');

/**
 * Shared ESLint base for the Node/TypeScript packages (ESLint 8 "eslintrc"
 * format, which the Nest CLI still expects).
 *
 * Consumers extend it via:
 *   { extends: [require.resolve('@pharma-erp/config/eslint/base')] }
 *
 * `require.resolve` rather than the bare specifier because ESLint 8's own
 * resolver ignores the package's "exports" map.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    // Must stay last so formatting rules defer to Prettier.
    'prettier',
  ],
  env: { es2022: true, node: true },
  rules: { ...core, ...importRules },
  ignorePatterns,
};
