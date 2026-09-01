module.exports = {
  extends: [require.resolve('@pharma-erp/config/eslint/base')],
  parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: __dirname },
  ignorePatterns: ['dist', 'node_modules', 'prisma/migrations'],
};
