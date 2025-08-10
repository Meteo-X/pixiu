module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/utils', '<rootDir>/fixtures'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    '../../src/**/*.ts',
    '!../../src/**/*.d.ts',
    '!../../src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 60000, // 1分钟超时，适合集成测试
  maxWorkers: 2, // 控制并发数避免资源竞争
  forceExit: true,
  detectOpenHandles: true,
  
  // 测试环境变量
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // 重构相关组件需要更高覆盖率
    '../../src/adapters/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};