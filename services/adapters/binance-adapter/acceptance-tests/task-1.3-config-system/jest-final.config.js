module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // 测试文件路径
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  
  // TypeScript 配置
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'es2020',
        lib: ['es2020'],
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true
      }
    }]
  },
  
  // 模块解析
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../../../src/$1',
    '^@config/(.*)$': '<rootDir>/../../../src/config/$1',
    '^@fixtures/(.*)$': '<rootDir>/fixtures/$1'
  },
  
  // 覆盖率配置
  collectCoverage: true,
  collectCoverageFrom: [
    '../../../src/config/**/*.ts',
    '!../../../src/config/**/*.d.ts',
    '!../../../src/config/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 测试环境设置
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  testTimeout: 30000,
  
  // 性能配置
  maxWorkers: '50%',
  
  // 详细输出
  verbose: true,
  
  // 错误处理
  bail: false,
  forceExit: true,
  detectOpenHandles: true
};