/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'test-utils',
  
  // 测试匹配模式
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  // TypeScript配置
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  
  // 模块路径映射
  moduleNameMapper: {},
  
  // 覆盖率设置
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 测试设置
  setupFilesAfterEnv: [],
  
  // 清除模拟
  clearMocks: true,
  restoreMocks: true,
  
  // 超时设置
  testTimeout: 10000,
  
  // 详细输出
  verbose: false
};