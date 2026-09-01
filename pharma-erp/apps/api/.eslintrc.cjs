module.exports = {
  extends: [require.resolve('@pharma-erp/config/eslint/nest')],
  parserOptions: {
    // tsconfig.eslint.json rather than tsconfig.json: the latter excludes
    // *.spec.ts, and type-aware rules error on any file outside the program.
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
};
