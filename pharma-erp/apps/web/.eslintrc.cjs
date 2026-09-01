module.exports = {
  extends: [require.resolve('@pharma-erp/config/eslint/next')],
  parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: __dirname },
  settings: { next: { rootDir: __dirname } },
};
