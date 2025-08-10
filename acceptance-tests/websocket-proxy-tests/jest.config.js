const { pathsToModuleNameMapper } = require('ts-jest');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/tests/**/*.test.ts'
  ],
  
  // 忽略的测试文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // 覆盖率设置
  collectCoverageFrom: [
    '../../services/data-collection/exchange-collector/src/websocket/**/*.ts',
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
    'json-summary'
  ],
  
  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    './../../services/data-collection/exchange-collector/src/websocket/websocket-proxy.ts': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    './../../services/data-collection/exchange-collector/src/websocket/connection-pool-manager.ts': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    }
  },
  
  // 设置文件
  setupFilesAfterEnv: [
    '<rootDir>/setup.ts'
  ],
  
  // 测试序列器
  testSequencer: '<rootDir>/test-sequencer.js',
  
  // 超时设置
  testTimeout: 30000,
  
  // 工作进程数量
  maxWorkers: 4,
  
  // 并发设置
  maxConcurrency: 5,
  
  // 报告器
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './reports',
      filename: 'test-report.html',
      expand: true
    }]
  ],
  
  // TypeScript 配置
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2018',
          lib: ['es2018'],
          allowJs: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true
        }
      }
    }]
  },
  
  // 模块名映射
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../../services/data-collection/exchange-collector/src/$1',
    '^@pixiu/shared-core$': '<rootDir>/../../services/infrastructure/shared-core/src',
    '^@pixiu/exchange-collector$': '<rootDir>/../../services/data-collection/exchange-collector/src'
  },
  
  // 全局设置
  globals: {
    'ts-jest': {
      useESM: false
    }
  },
  
  // 详细输出
  verbose: true,
  
  // 错误输出
  errorOnDeprecated: true,
  
  // 清理Mock
  clearMocks: true,
  restoreMocks: true,
  
  // 内存泄漏检测
  detectOpenHandles: true,
  detectLeaks: false,
  
  // 强制退出
  forceExit: false,
  
  // 日志级别
  silent: false
};