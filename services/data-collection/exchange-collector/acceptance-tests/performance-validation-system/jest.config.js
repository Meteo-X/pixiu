/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  collectCoverageFrom: [
    'tests/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/**/fixtures/**',
    '!tests/**/helpers/**',
    '!tests/**/mock-*/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  testTimeout: 120000,
  maxWorkers: 1,
  forceExit: true,
  verbose: true,
  detectOpenHandles: true,
  
  // Performance test specific configuration
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'Performance Test Report',
      outputPath: 'reports/performance-test-report.html',
      includeFailureMsg: true,
      includeSuiteFailure: true
    }]
  ],

  // Test categorization
  projects: [
    {
      displayName: 'Throughput Tests',
      testMatch: ['<rootDir>/tests/throughput/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'Latency Tests', 
      testMatch: ['<rootDir>/tests/latency/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'Memory Tests',
      testMatch: ['<rootDir>/tests/memory/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'WebSocket Tests',
      testMatch: ['<rootDir>/tests/websocket/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'DataFlow Tests',
      testMatch: ['<rootDir>/tests/dataflow/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'Stability Tests',
      testMatch: ['<rootDir>/tests/stability/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts'],
      testTimeout: 300000 // 5 minutes for stability tests
    },
    {
      displayName: 'Monitoring Tests',
      testMatch: ['<rootDir>/tests/monitoring/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    },
    {
      displayName: 'Regression Tests',
      testMatch: ['<rootDir>/tests/regression/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/setup.ts']
    }
  ]
};