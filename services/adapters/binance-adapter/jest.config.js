/**
 * Binance Adapter Jest配置 - 全面测试套件版本
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
    '<rootDir>/tests/**/*.test.{js,ts}',
    '<rootDir>/tests/**/*.spec.{js,ts}'
  ],
  
  // 忽略特定测试文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // 模块解析
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // 覆盖率收集
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,ts}',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/**/*.interface.ts',
    '!<rootDir>/src/**/*.type.ts'
  ],
  
  // 覆盖率输出目录
  coverageDirectory: '<rootDir>/coverage',
  
  // 覆盖率报告格式
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json-summary'
  ],
  
  // 覆盖率阈值（针对重构后的完整测试）
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 88,
      statements: 88
    },
    // 具体文件的覆盖率要求
    './src/binance-adapter.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/connection/binance-connection-manager.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // 清理模式
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  
  // 详细输出
  verbose: true,
  
  // 超时设置
  testTimeout: 30000, // 增加超时时间以支持性能测试
  
  // 设置环境变量
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // 设置文件
  setupFiles: ['<rootDir>/tests/jest-setup.ts'],
  
  // 全局变量
  globals: {
    'ts-jest': {
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        strict: true
      }
    }
  },
  
  // 并发运行
  maxWorkers: '50%',
  
  // 缓存配置
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // 错误报告
  errorOnDeprecated: true,
  
  // 静默模式配置
  silent: false,
  
  // 测试结果处理器
  testResultsProcessor: undefined,
  
  // 监视插件
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // 项目配置（支持分类运行）
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/tests/**/!(integration|performance).test.ts']
    },
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/tests/integration.test.ts']
    },
    {
      displayName: 'Performance Tests',
      testMatch: ['<rootDir>/tests/performance.test.ts'],
      testTimeout: 120000 // 性能测试需要更长时间
    }
  ]
};