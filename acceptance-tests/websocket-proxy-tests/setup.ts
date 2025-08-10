/**
 * Jest 测试环境设置
 * WebSocket代理测试套件全局配置
 */

// 增加测试超时时间（特别是性能测试需要更长时间）
jest.setTimeout(60000);

// 全局变量声明
declare global {
  namespace NodeJS {
    interface Global {
      testStartTime: number;
      testMetrics: Map<string, any>;
    }
  }
}

// 全局测试指标收集器
global.testMetrics = new Map();

// 设置测试开始时间
global.testStartTime = Date.now();

// 控制台输出美化
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: any[]) => {
  const timestamp = new Date().toISOString();
  originalLog(`[${timestamp}] [LOG]`, ...args);
};

console.error = (...args: any[]) => {
  const timestamp = new Date().toISOString();
  originalError(`[${timestamp}] [ERROR]`, ...args);
};

console.warn = (...args: any[]) => {
  const timestamp = new Date().toISOString();
  originalWarn(`[${timestamp}] [WARN]`, ...args);
};

// 测试环境信息
console.log('🚀 WebSocket代理测试套件启动');
console.log('📊 测试环境配置:', {
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  memory: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
  testTimeout: 60000,
  maxWorkers: 4
});

// 内存监控
let memoryMonitorInterval: NodeJS.Timeout;

beforeAll(() => {
  console.log('🎯 开始WebSocket代理功能测试');
  
  // 启动内存监控
  memoryMonitorInterval = setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    // 只有在内存使用超过阈值时才输出警告
    if (heapUsedMB > 256) {
      console.warn(`⚠️  内存使用较高: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }
  }, 30000); // 每30秒检查一次
});

afterAll(() => {
  // 清理内存监控
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  
  // 输出测试总结
  const totalTime = Date.now() - global.testStartTime;
  const finalMemory = process.memoryUsage();
  
  console.log('✅ WebSocket代理测试套件完成');
  console.log('📈 测试总结:', {
    totalTime: `${totalTime}ms`,
    finalMemoryUsage: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
    metricsCollected: global.testMetrics.size
  });
  
  // 强制垃圾收集（如果可用）
  if (global.gc) {
    global.gc();
  }
});

// 全局测试辅助函数
global.collectTestMetric = (key: string, value: any) => {
  global.testMetrics.set(key, value);
};

global.getTestMetric = (key: string) => {
  return global.testMetrics.get(key);
};

// 异步错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 退出处理
process.on('SIGINT', () => {
  console.log('🛑 收到中断信号，正在清理测试环境...');
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 收到终止信号，正在清理测试环境...');
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  process.exit(0);
});

// 导出测试配置常量
export const TEST_CONFIG = {
  // WebSocket测试配置
  WEBSOCKET_PORT_RANGE: [3000, 3100],
  MAX_CONCURRENT_CONNECTIONS: 1000,
  CONNECTION_TIMEOUT: 30000,
  MESSAGE_TIMEOUT: 5000,
  
  // 性能测试阈值
  PERFORMANCE_THRESHOLDS: {
    connectionLatency: 100, // ms
    messageLatency: 10, // ms
    memoryLeakThreshold: 50 * 1024 * 1024, // 50MB
    maxCpuUsage: 80 // %
  },
  
  // 负载测试配置
  LOAD_TEST: {
    smallLoad: 10,
    mediumLoad: 100,
    largeLoad: 500,
    stressLoad: 1000
  },
  
  // 重试配置
  RETRY: {
    maxAttempts: 3,
    delay: 1000,
    backoffMultiplier: 2
  },
  
  // 测试数据配置
  TEST_DATA: {
    smallMessageSize: 1024, // 1KB
    mediumMessageSize: 10 * 1024, // 10KB
    largeMessageSize: 100 * 1024, // 100KB
    maxMessageSize: 1024 * 1024 // 1MB
  }
};

console.log('⚙️  测试配置加载完成:', TEST_CONFIG);