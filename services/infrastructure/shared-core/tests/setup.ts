/**
 * Shared Core测试设置
 */

// 设置测试超时
jest.setTimeout(10000);

// Mock外部依赖
jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    topic: jest.fn().mockReturnValue({
      publishMessage: jest.fn().mockResolvedValue(['mock-message-id']),
      createSubscription: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue([])
    }),
    subscription: jest.fn().mockReturnValue({
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      close: jest.fn(),
      setOptions: jest.fn()
    }),
    createTopic: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock Redis (removed as dependency was cleaned up)

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

// 控制台输出过滤（减少测试时的噪音）
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const message = args[0]?.toString() || '';
  if (message.includes('Warning:') || message.includes('deprecated')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  // 在测试中通常不需要看到警告
  return;
};

// 导出以使此文件成为模块
export {};