module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    '../../src/connector/ErrorHandler.ts',
    '../../src/connector/LatencyMonitor.ts',
    '../../src/connector/AdapterStatusMonitor.ts',
    '../../src/BinanceAdapterEnhanced.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  // 并行测试配置
  maxWorkers: 4,
  // 内存泄漏检测
  detectLeaks: true,
  // 强制退出阈值
  forceExit: true,
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  // 测试报告
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './reports',
      filename: 'test-report.html',
      expand: true
    }]
  ]
};