/**
 * Binance Adapter Jest配置 - 简化版本
 */

module.exports = {
  // 基础配置
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  
  // 测试文件匹配
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,ts}',
    '<rootDir>/tests/**/*.spec.{js,ts}'
  ],
  
  // 忽略目录
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // 模块映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // TypeScript处理
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  
  // 设置文件
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // 覆盖率设置
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,ts}',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts'
  ],
  coverageDirectory: '<rootDir>/coverage',
  
  // 清理设置
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  // 输出设置
  verbose: true,
  
  
  // 缓存设置
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache'
};