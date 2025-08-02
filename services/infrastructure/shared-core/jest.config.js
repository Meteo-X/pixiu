/**
 * Shared Core Jest配置
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',
  
  // 根目录
  rootDir: '.',
  
  // TypeScript支持
  preset: 'ts-jest',
  
  // 测试匹配模式
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,ts}'
  ],
  
  // 覆盖率收集
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,ts}',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts'
  ],
  
  // 覆盖率输出目录
  coverageDirectory: '<rootDir>/coverage',
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // 清理模式
  clearMocks: true,
  restoreMocks: true,
  
  // 详细输出
  verbose: true,
  
  // 超时设置
  testTimeout: 10000,
  
  // 设置环境变量
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};