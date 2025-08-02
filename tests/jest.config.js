/**
 * Jest配置 - 全局测试配置
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
    '<rootDir>/unit/**/*.test.{js,ts}',
    '<rootDir>/integration/**/*.test.{js,ts}',
    '<rootDir>/e2e/**/*.test.{js,ts}'
  ],
  
  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/setup/unit-setup.ts'],
  
  // 覆盖率收集
  collectCoverageFrom: [
    '<rootDir>/../services/**/*.{js,ts}',
    '!<rootDir>/../services/**/node_modules/**',
    '!<rootDir>/../services/**/dist/**',
    '!<rootDir>/../services/**/*.test.{js,ts}',
    '!<rootDir>/../services/**/*.spec.{js,ts}'
  ],
  
  // 覆盖率输出目录
  coverageDirectory: '<rootDir>/coverage',
  
  // 全局设置
  globalSetup: '<rootDir>/setup/global-setup.ts',
  globalTeardown: '<rootDir>/setup/global-teardown.ts',
  
  // 清理模式
  clearMocks: true,
  restoreMocks: true,
  
  // 详细输出
  verbose: true,
  
  // 超时设置
  testTimeout: 30000
};