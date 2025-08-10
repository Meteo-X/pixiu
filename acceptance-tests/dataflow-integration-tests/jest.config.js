/**
 * Jest配置 - DataFlow集成测试套件
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  
  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // 覆盖率收集
  collectCoverageFrom: [
    'tests/**/*.ts',
    '!tests/**/*.d.ts',
    '!tests/fixtures/**',
    '!tests/helpers/**', 
    '!tests/mocks/**',
    '!tests/setup/**'
  ],
  
  // 覆盖率配置
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov', 
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // 测试设置
  setupFilesAfterEnv: [
    '<rootDir>/setup.ts'
  ],
  
  // 超时和并发配置
  testTimeout: 30000,
  maxWorkers: '50%',
  
  // 测试序列化器（确保测试顺序）
  testSequencer: '<rootDir>/test-sequencer.js',
  
  // 报告配置
  reporters: [
    'default'
  ],
  
  // 全局变量
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  
  // 测试环境变量
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // 模块路径映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/tests/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/helpers/$1',
    '^@mocks/(.*)$': '<rootDir>/mocks/$1'
  },
  
  // 详细输出
  verbose: true,
  
  // 静默废弃警告
  silent: false,
  
  // 自动清理模拟
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  // 错误处理
  bail: false,
  errorOnDeprecated: true
};