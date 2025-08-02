/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'tests/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 4,
  verbose: true,
  // testSequencer: '<rootDir>/test-sequencer.js',
  // globalSetup: '<rootDir>/global-setup.ts',
  // globalTeardown: '<rootDir>/global-teardown.ts',
  reporters: ['default']
};