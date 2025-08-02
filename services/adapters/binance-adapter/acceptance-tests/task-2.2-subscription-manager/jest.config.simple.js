/**
 * Simplified Jest configuration for Task 2.2 Subscription Manager acceptance tests
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  
  // Setup
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  
  // Module resolution
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/../../src/$1'
  },
  
  // TypeScript
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // Coverage
  collectCoverageFrom: [
    '../../src/subscription/**/*.ts',
    '!../../src/subscription/**/*.d.ts',
    '!../../src/subscription/**/*.test.ts'
  ],
  
  // Timeouts
  testTimeout: 30000,
  
  // Clear mocks
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose for debugging
  verbose: true
};