const baseConfig = require('./base');

/**
 * ESLint config for the NestJS API app. Adds the type-aware rules that need a
 * tsconfig, which the consumer supplies via parserOptions.project.
 */
module.exports = {
  ...baseConfig,
  env: { ...baseConfig.env, jest: true },
  rules: {
    ...baseConfig.rules,
    // Nest's idioms: decorated classes and constructor-injected
    // `private readonly` parameters with empty constructor bodies.
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    // Type-aware, so they need parserOptions.project from the consumer. A
    // floating promise in a request handler swallows the error and skips the
    // exception filter, which is why these are errors rather than warnings.
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
};
