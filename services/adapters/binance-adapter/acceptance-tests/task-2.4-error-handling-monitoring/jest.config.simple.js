module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/acceptance/error-handling.test.ts',
    '**/tests/acceptance/latency-monitoring.test.ts',
    '**/tests/acceptance/status-monitoring.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 15000,
  verbose: true,
  maxWorkers: 1,
  // 简化的配置用于快速验证
  collectCoverage: false
};