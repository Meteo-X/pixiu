module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件路径
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  
  // TypeScript 配置
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // 模块解析
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../../../src/$1',
    '^@config/(.*)$': '<rootDir>/../../../src/config/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1'
  },
  
  // 覆盖率配置
  collectCoverage: true,
  collectCoverageFrom: [
    '../../../src/config/**/*.ts',
    '!../../../src/config/**/*.d.ts',
    '!../../../src/config/__tests__/**',
    '!../../../src/config/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // 测试环境设置
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  
  // 性能配置
  maxWorkers: '50%',
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // 详细输出
  verbose: true,
  
  // 错误处理
  bail: false,
  forceExit: true,
  detectOpenHandles: true,
  
  // 测试结果格式化
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage',
      filename: 'test-report.html',
      expand: true
    }]
  ],
  
  // 全局变量
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020'],
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true
        }
      }
    }
  }
};