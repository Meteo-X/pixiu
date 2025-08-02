module.exports = {
  // 基础配置
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件位置
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // TypeScript转换
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // 模块解析
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/fixtures/helpers/$1'
  },
  
  // 覆盖率配置
  collectCoverage: true,
  collectCoverageFrom: [
    '../../../src/config/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html',
    'json',
    'clover'
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
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  maxWorkers: '50%',
  verbose: true,
  
  // 测试顺序控制
  testSequencer: '<rootDir>/test-sequencer.js',
  
  // 报告配置
  reporters: [
    'default',
    ['jest-html-reporters', {
      pageTitle: 'Task 3.2 Configuration System Refactoring - Acceptance Test Report',
      publicPath: './reports',
      filename: 'test-report.html',
      includeFailureMsg: true,
      includeSuiteFailure: true
    }],
    ['jest-junit', {
      outputDirectory: './reports',
      outputName: 'junit.xml',
      suiteName: 'Task 3.2 Configuration System Tests'
    }]
  ],
  
  // 全局变量
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }
  },
  
  // 清理和优化
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  // 错误处理
  errorOnDeprecated: true,
  
  // 测试结果缓存
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // 监控模式配置
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/reports/'
  ]
};