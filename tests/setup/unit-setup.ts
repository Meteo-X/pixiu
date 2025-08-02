/**
 * 单元测试设置
 * 在每个单元测试文件运行前执行
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
      options: {}
    }),
    createTopic: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

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

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  })
}));

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

// 全局测试工具
(global as any).testUtils = {
  /**
   * 等待指定时间
   */
  wait: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 创建模拟的市场数据
   */
  createMockMarketData: (overrides = {}) => ({
    exchange: 'binance',
    symbol: 'BTC/USDT',
    type: 'trade',
    timestamp: Date.now(),
    data: {
      id: '12345',
      price: 50000,
      quantity: 0.1,
      side: 'buy'
    },
    receivedAt: Date.now(),
    ...overrides
  }),

  /**
   * 创建模拟的配置
   */
  createMockConfig: (overrides = {}) => ({
    exchange: 'binance',
    endpoints: {
      ws: 'wss://mock.binance.com/ws',
      rest: 'https://mock.binance.com/api'
    },
    connection: {
      timeout: 5000,
      maxRetries: 3,
      retryInterval: 1000,
      heartbeatInterval: 30000
    },
    ...overrides
  })
};

// 类型声明
declare global {
  var testUtils: {
    wait: (ms: number) => Promise<void>;
    createMockMarketData: (overrides?: any) => any;
    createMockConfig: (overrides?: any) => any;
  };
}

// 控制台输出过滤（减少测试时的噪音）
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  // 过滤掉一些已知的无害错误
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