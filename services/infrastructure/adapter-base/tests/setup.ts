/**
 * Adapter Base测试设置
 */

// 设置测试超时
jest.setTimeout(10000);

// Mock WebSocket
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    readyState: 1, // OPEN
    OPEN: 1,
    CLOSED: 3
  }));
});

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// 控制台输出过滤
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const message = args[0]?.toString() || '';
  if (message.includes('Warning:') || message.includes('deprecated')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = () => {
  // 在测试中通常不需要看到警告
  return;
};

// 导出以使此文件成为模块
export {};