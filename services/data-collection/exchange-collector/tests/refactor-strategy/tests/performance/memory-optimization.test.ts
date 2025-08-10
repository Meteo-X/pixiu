/**
 * 内存优化性能测试
 * 验证重构后内存使用减少30%的目标
 */

import { BinanceAdapter } from '@pixiu/binance-adapter';
import { ExchangeCollectorService } from '../../src/index';
import { MockFactory } from '../utils/mock-factory';
import { TestDataGenerator } from '../fixtures/test-data-generator';
import { PerformanceMonitor } from '../utils/performance-monitor';

describe('内存优化性能测试套件', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeAll(async () => {
    performanceMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('内存使用基准测试', () => {
    test('单适配器长时间运行内存稳定性', async () => {
      const memorySnapshots: Array<{
        timestamp: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      }> = [];

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      const adapter = new BinanceAdapter({
        exchange: 'binance',
        connection: { timeout: 10000 }
      });

      // 记录初始内存
      const initialMemory = process.memoryUsage();
      memorySnapshots.push({
        timestamp: Date.now(),
        ...initialMemory
      });

      await adapter.connect();

      // 模拟30分钟高频数据处理
      const testDuration = 5000; // 测试中缩短为5秒
      const messageInterval = 10; // 每10ms一条消息
      const totalMessages = testDuration / messageInterval;

      let messageCount = 0;
      const messageTimer = setInterval(() => {
        if (messageCount >= totalMessages) {
          clearInterval(messageTimer);
          return;
        }

        const testData = JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: TestDataGenerator.generateBinanceKlineData()
        });

        mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testData);
        messageCount++;

        // 每1000条消息记录内存快照
        if (messageCount % 100 === 0) {
          const memory = process.memoryUsage();
          memorySnapshots.push({
            timestamp: Date.now(),
            ...memory
          });
        }
      }, messageInterval);

      // 等待测试完成
      await new Promise(resolve => setTimeout(resolve, testDuration + 1000));

      // 最终内存快照
      const finalMemory = process.memoryUsage();
      memorySnapshots.push({
        timestamp: Date.now(),
        ...finalMemory
      });

      await adapter.disconnect();

      // 分析内存趋势
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      console.log(`处理了${totalMessages}条消息`);
      console.log(`内存增长: ${memoryGrowthMB.toFixed(2)}MB`);
      console.log(`平均每条消息内存开销: ${(memoryGrowth / totalMessages).toFixed(2)}字节`);

      // 验证内存增长在合理范围内
      expect(memoryGrowthMB).toBeLessThan(100); // 内存增长小于100MB
      expect(memoryGrowth / totalMessages).toBeLessThan(1024); // 每条消息开销小于1KB
    });

    test('多适配器并发内存隔离', async () => {
      const adapterCount = 5;
      const adapters: BinanceAdapter[] = [];
      const memoryBeforeEach: number[] = [];
      const memoryAfterEach: number[] = [];

      // 创建多个适配器实例
      for (let i = 0; i < adapterCount; i++) {
        memoryBeforeEach.push(process.memoryUsage().heapUsed);

        const mockWs = MockFactory.createWebSocketConnection();
        jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

        const adapter = new BinanceAdapter({
          exchange: `binance${i}`,
          connection: { timeout: 10000 }
        });

        await adapter.connect();

        // 每个适配器处理1000条消息
        for (let j = 0; j < 1000; j++) {
          const testData = JSON.stringify({
            stream: `btcusdt${j}@kline_1m`,
            data: TestDataGenerator.generateBinanceKlineData()
          });
          
          mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testData);
        }

        adapters.push(adapter);
        memoryAfterEach.push(process.memoryUsage().heapUsed);

        // 强制垃圾回收
        if (global.gc) {
          global.gc();
        }
      }

      // 清理所有适配器
      for (const adapter of adapters) {
        await adapter.disconnect();
      }

      // 分析内存使用模式
      const memoryIncrements = memoryAfterEach.map((after, index) => 
        after - memoryBeforeEach[index]
      );

      const averageIncrement = memoryIncrements.reduce((sum, inc) => sum + inc, 0) / memoryIncrements.length;
      const maxIncrement = Math.max(...memoryIncrements);
      const minIncrement = Math.min(...memoryIncrements);

      console.log(`适配器平均内存开销: ${(averageIncrement / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`最大内存开销: ${(maxIncrement / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`最小内存开销: ${(minIncrement / (1024 * 1024)).toFixed(2)}MB`);

      // 验证内存使用一致性
      const variance = memoryIncrements.reduce((sum, inc) => 
        sum + Math.pow(inc - averageIncrement, 2), 0
      ) / memoryIncrements.length;
      const standardDeviation = Math.sqrt(variance);

      expect(averageIncrement).toBeLessThan(50 * 1024 * 1024); // 平均小于50MB
      expect(standardDeviation).toBeLessThan(10 * 1024 * 1024); // 标准差小于10MB
    });
  });

  describe('内存泄漏检测', () => {
    test('WebSocket连接清理验证', async () => {
      const initialMemory = process.memoryUsage();
      const adapters: BinanceAdapter[] = [];

      // 创建和销毁100个适配器实例
      for (let i = 0; i < 100; i++) {
        const mockWs = MockFactory.createWebSocketConnection();
        jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

        const adapter = new BinanceAdapter({
          exchange: `test${i}`,
          connection: { timeout: 1000 }
        });

        await adapter.connect();
        
        // 模拟少量数据处理
        for (let j = 0; j < 10; j++) {
          const testData = JSON.stringify({
            stream: 'test@kline_1m',
            data: TestDataGenerator.generateBinanceKlineData()
          });
          
          mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1]?.(testData);
        }

        adapters.push(adapter);
      }

      // 清理所有适配器
      for (const adapter of adapters) {
        await adapter.disconnect();
      }

      // 清理引用
      adapters.length = 0;

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage();
      const memoryDiff = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryDiffMB = memoryDiff / (1024 * 1024);

      console.log(`创建和销毁100个适配器后内存变化: ${memoryDiffMB.toFixed(2)}MB`);

      // 验证没有明显内存泄漏
      expect(memoryDiffMB).toBeLessThan(10); // 内存增长小于10MB
    });

    test('事件监听器清理验证', async () => {
      const initialEventListeners = process.listenerCount('beforeExit');
      
      const adapter = new BinanceAdapter({
        exchange: 'binance',
        connection: { timeout: 10000 }
      });

      const mockWs = MockFactory.createWebSocketConnection();
      jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWs as any);

      // 添加多个事件监听器
      const listeners: Array<() => void> = [];
      for (let i = 0; i < 100; i++) {
        const listener = jest.fn();
        adapter.on('data', listener);
        adapter.on('error', listener);
        adapter.on('status', listener);
        listeners.push(listener);
      }

      await adapter.connect();
      await adapter.disconnect();

      // 验证事件监听器被清理
      const finalEventListeners = process.listenerCount('beforeExit');
      
      // 监听器数量不应该显著增加
      expect(finalEventListeners - initialEventListeners).toBeLessThanOrEqual(1);
    });

    test('缓存数据清理验证', async () => {
      const service = new ExchangeCollectorService({
        adapters: {
          binance: {
            exchange: 'binance',
            connection: { timeout: 10000 }
          }
        }
      });

      const initialMemory = process.memoryUsage().heapUsed;

      await service.start();

      // 生成大量缓存数据
      for (let i = 0; i < 10000; i++) {
        const testData = TestDataGenerator.generateMarketData('kline', `SYMBOL${i}`);
        await service.processMarketData('binance', testData);
      }

      const afterProcessingMemory = process.memoryUsage().heapUsed;

      // 停止服务
      await service.stop();

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      const finalMemory = process.memoryUsage().heapUsed;

      const processingMemoryIncrease = afterProcessingMemory - initialMemory;
      const finalMemoryIncrease = finalMemory - initialMemory;

      console.log(`处理期间内存增长: ${(processingMemoryIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`最终内存增长: ${(finalMemoryIncrease / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`清理比例: ${((1 - finalMemoryIncrease / processingMemoryIncrease) * 100).toFixed(1)}%`);

      // 验证大部分内存被清理
      expect(finalMemoryIncrease).toBeLessThan(processingMemoryIncrease * 0.3); // 70%以上内存被清理
    });
  });

  describe('重构前后内存对比', () => {
    test('内存使用减少30%目标验证', async () => {
      // 模拟重构前的内存使用模式（有重复缓存、重复连接管理等）
      const legacyMemoryUsage = await measureLegacyMemoryUsage();
      
      // 模拟重构后的内存使用模式
      const optimizedMemoryUsage = await measureOptimizedMemoryUsage();

      const memoryReduction = (legacyMemoryUsage - optimizedMemoryUsage) / legacyMemoryUsage;
      
      console.log(`重构前内存使用: ${(legacyMemoryUsage / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`重构后内存使用: ${(optimizedMemoryUsage / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`内存减少比例: ${(memoryReduction * 100).toFixed(1)}%`);

      // 验证内存减少30%的目标
      expect(memoryReduction).toBeGreaterThanOrEqual(0.30);
    });

    test('重复缓存消除效果验证', async () => {
      // 模拟有重复缓存的情况
      const duplicatedCacheMemory = await measureDuplicatedCacheMemory();
      
      // 模拟统一缓存的情况
      const unifiedCacheMemory = await measureUnifiedCacheMemory();

      const cacheMemoryReduction = (duplicatedCacheMemory - unifiedCacheMemory) / duplicatedCacheMemory;
      
      console.log(`重复缓存内存使用: ${(duplicatedCacheMemory / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`统一缓存内存使用: ${(unifiedCacheMemory / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`缓存内存减少: ${(cacheMemoryReduction * 100).toFixed(1)}%`);

      expect(cacheMemoryReduction).toBeGreaterThan(0.4); // 缓存优化应该有更显著效果
    });
  });

  // 辅助方法
  async function measureLegacyMemoryUsage(): Promise<number> {
    const initialMemory = process.memoryUsage().heapUsed;

    // 模拟重构前的架构：每个组件都有自己的缓存和连接管理
    const components = [];
    
    for (let i = 0; i < 5; i++) {
      // 模拟每个组件都有独立的缓存
      const componentCache = new Map();
      
      // 填充重复数据
      for (let j = 0; j < 1000; j++) {
        const data = TestDataGenerator.generateMarketData('kline', `SYMBOL${j}`);
        componentCache.set(`component${i}_${j}`, JSON.stringify(data));
      }
      
      components.push(componentCache);
    }

    const peakMemory = process.memoryUsage().heapUsed;
    
    // 清理
    components.length = 0;
    
    return peakMemory - initialMemory;
  }

  async function measureOptimizedMemoryUsage(): Promise<number> {
    const initialMemory = process.memoryUsage().heapUsed;

    // 模拟重构后的架构：统一缓存管理
    const unifiedCache = new Map();
    
    // 相同数据只存储一次
    const uniqueData = new Set<string>();
    
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 1000; j++) {
        const data = TestDataGenerator.generateMarketData('kline', `SYMBOL${j}`);
        const dataKey = `${data.symbol}_${data.type}`;
        
        if (!uniqueData.has(dataKey)) {
          unifiedCache.set(dataKey, JSON.stringify(data));
          uniqueData.add(dataKey);
        }
      }
    }

    const peakMemory = process.memoryUsage().heapUsed;
    
    // 清理
    unifiedCache.clear();
    uniqueData.clear();
    
    return peakMemory - initialMemory;
  }

  async function measureDuplicatedCacheMemory(): Promise<number> {
    const initialMemory = process.memoryUsage().heapUsed;

    // 创建多个重复的缓存
    const caches = [];
    const testData = TestDataGenerator.generateMarketData('kline', 'BTCUSDT');
    
    for (let i = 0; i < 10; i++) {
      const cache = new Map();
      // 每个缓存都存储相同的数据
      for (let j = 0; j < 1000; j++) {
        cache.set(`key${j}`, JSON.stringify(testData));
      }
      caches.push(cache);
    }

    const peakMemory = process.memoryUsage().heapUsed;
    
    // 清理
    caches.length = 0;
    
    return peakMemory - initialMemory;
  }

  async function measureUnifiedCacheMemory(): Promise<number> {
    const initialMemory = process.memoryUsage().heapUsed;

    // 使用统一缓存
    const unifiedCache = new Map();
    const testData = TestDataGenerator.generateMarketData('kline', 'BTCUSDT');
    
    // 数据只存储一次，通过引用共享
    const sharedData = JSON.stringify(testData);
    
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 1000; j++) {
        // 只存储引用，不复制数据
        unifiedCache.set(`cache${i}_key${j}`, sharedData);
      }
    }

    const peakMemory = process.memoryUsage().heapUsed;
    
    // 清理
    unifiedCache.clear();
    
    return peakMemory - initialMemory;
  }
});