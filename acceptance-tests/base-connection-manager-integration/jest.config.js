module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts'
  ],
  
  // TypeScript configuration
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/helpers/$1',
    '^@mocks/(.*)$': '<rootDir>/mocks/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Coverage configuration
  collectCoverageFrom: [
    'tests/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/**/index.ts',
    '!tests/**/*.test.ts'
  ],
  
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  coverageDirectory: 'coverage',
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    }
  },
  
  // Parallel test execution
  maxWorkers: 4,
  
  // Silence console output during tests
  silent: false,
  verbose: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test sequencing
  testSequencer: './test-sequencer.js'
};