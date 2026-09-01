/**
 * Jest config lives here rather than in package.json so the regexes below can
 * be written as plain patterns instead of double-escaped JSON strings.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Only .ts: workspace dependencies are consumed as compiled JS from their
  // dist/, and handing those to ts-jest makes it warn on every one for no gain.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // Nest's DI reads decorator metadata at class-definition time, so the shim
  // has to be installed before any spec imports a provider.
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
