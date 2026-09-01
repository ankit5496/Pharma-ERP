/**
 * Rules shared by every preset, kept separate from the presets themselves.
 *
 * Why the split: ESLint 8 aborts with "couldn't determine the plugin X
 * uniquely" if two configs in one chain each declare the same plugin and pnpm
 * resolves them to different files — which it does the moment
 * eslint-config-next and our base config both depend on eslint-plugin-import.
 * Keeping the rules here lets each preset declare its plugins exactly once.
 */

/** Rules that need no plugin beyond @typescript-eslint. */
const core = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  // `any` silently disables the type checking this project relies on for
  // tenant-scoping correctness — warn now, tighten to error before v1.
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  eqeqeq: ['error', 'smart'],
  'no-restricted-syntax': [
    'error',
    {
      // Every raw query is a hole in the Prisma-level tenant filter and must be
      // reviewed deliberately; opt out inline with an eslint-disable comment
      // saying why the query is safe under RLS.
      selector: 'CallExpression[callee.property.name=/^\\$queryRawUnsafe$|^\\$executeRawUnsafe$/]',
      message:
        'Unsafe raw SQL: use the tagged-template $queryRaw/$executeRaw so values are parameterised.',
    },
  ],
};

/** Rules that require eslint-plugin-import to be declared by the preset. */
const importRules = {
  'import/order': [
    'warn',
    {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      pathGroups: [{ pattern: '@pharma-erp/**', group: 'internal', position: 'before' }],
      pathGroupsExcludedImportTypes: ['builtin'],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
  // TypeScript already resolves modules and reports failures with better
  // messages; the plugin's resolver duplicates that and misfires on exports maps.
  'import/no-unresolved': 'off',
};

const ignorePatterns = [
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '*.config.js',
  '*.config.mjs',
];

module.exports = { core, importRules, ignorePatterns };
