/**
 * Jest configuration for Task 2.2 Subscription Manager acceptance tests
 * 
 * Configured for comprehensive testing including:
 * - Unit, integration, and acceptance tests
 * - Performance benchmarking
 * - Coverage reporting
 * - CI/CD pipeline compatibility
 */

module.exports = {
  // Basic configuration
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // TypeScript handling
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'es2020',
        lib: ['es2020'],
        declaration: false,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true
      }
    }]
  },
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/tests/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/fixtures/helpers/$1',
    '^@src/(.*)$': '<rootDir>/../../src/$1'
  },
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  
  // Coverage configuration
  collectCoverageFrom: [
    '../../src/subscription/**/*.ts',
    '!../../src/subscription/**/*.d.ts',
    '!../../src/subscription/__tests__/**',
    'tests/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/fixtures/**',
    '!tests/setup.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './tests/acceptance/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './tests/integration/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Performance and timing
  testTimeout: 30000,
  maxWorkers: '50%',
  
  // Test result reporting
  reporters: [
    'default'
  ],
  
    // Test environment variables
    TEST_ENV: 'acceptance',
    LOG_LEVEL: 'error',
    NODE_ENV: 'test'
  },
  
  // Test patterns and organization
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Verbose output for CI
  verbose: process.env.CI === 'true',
  
  // Test result caching
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Watch mode configuration (disabled for CI)
  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname'
  // ],
  
  // Performance monitoring
  collectCoverage: true,
  detectOpenHandles: true,
  detectLeaks: false, // Can be enabled for memory leak detection
  
  // Custom matchers and extensions
  setupFiles: [],
  
  // Test result formatting
  displayName: {
    name: 'Task 2.2 - Subscription Manager',
    color: 'blue'
  }
};