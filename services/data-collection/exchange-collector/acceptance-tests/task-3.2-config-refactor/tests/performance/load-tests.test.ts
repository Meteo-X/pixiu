/**
 * Task 3.2 配置系统重构 - 性能负载测试
 * 验证配置系统在高负载情况下的性能表现
 */

import { 
  AdapterConfigFactory,
  AdapterType,
  AdapterConfiguration
} from '../../../../../../src/config/adapter-config';
import { MultiAdapterConfigManager } from '../../../../../../src/config/config-merger';
import { ExchangeCollectorConfigManager } from '../../../../../../src/config/service-config';
import { DataType } from '@pixiu/adapter-base';
import { 
  validBinanceConfig,
  validOkxConfig,
  largeConfig
} from '../../fixtures/test-data/adapter-configs';
import { 
  ConfigTestHelper, 
  TestDataGenerator 
} from '../../fixtures/helpers/test-helpers';

describe('Task 3.2 配置系统重构 - 性能负载测试', () => {
  let configManager: ExchangeCollectorConfigManager;
  let multiAdapterManager: MultiAdapterConfigManager;

  beforeEach(() => {
    configManager = new ExchangeCollectorConfigManager();
    multiAdapterManager = new MultiAdapterConfigManager();
  });

  afterEach(() => {
    multiAdapterManager.clear();
    ConfigTestHelper.cleanupTempFiles();
  });

  describe('大规模配置操作性能', () => {
    
    test('批量添加配置性能测试', async () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      const memoryMonitor = ConfigTestHelper.createMemoryMonitor();

      memoryMonitor.start();
      timer.start();

      // 生成大量配置
      const configCount = 1000;
      const configs: { [name: string]: { type: AdapterType; config: AdapterConfiguration } } = {};

      for (let i = 0; i < configCount; i++) {
        const adapterName = `adapter-${i}`;
        const adapterType = i % 2 === 0 ? AdapterType.BINANCE : AdapterType.OKEX;
        const baseConfig = adapterType === AdapterType.BINANCE ? validBinanceConfig : validOkxConfig;
        
        configs[adapterName] = {
          type: adapterType,
          config: {
            ...baseConfig,
            subscription: {
              ...baseConfig.subscription,
              symbols: [`SYMBOL${i}USDT`]
            }
          }
        };
      }

      timer.mark('config-generation');

      // 批量导入配置
      const results = multiAdapterManager.batchImportConfigs(configs);
      timer.mark('batch-import');

      // 验证所有配置都成功导入
      const successCount = Object.values(results).filter(result => result.success).length;
      expect(successCount).toBe(configCount);

      timer.mark('validation');

      const totalTime = timer.end();
      const finalMemory = memoryMonitor.stop();

      // 性能断言
      expect(totalTime).toBeLessThan(10000); // 应该在10秒内完成
      expect(finalMemory.heapUsed).toBeLessThan(500 * 1024 * 1024); // 内存使用不超过500MB

      console.log(`批量添加${configCount}个配置的性能指标:`);
      console.log(`- 配置生成: ${timer.getMarks()['config-generation'].toFixed(2)}ms`);
      console.log(`- 批量导入: ${(timer.getMarks()['batch-import'] - timer.getMarks()['config-generation']).toFixed(2)}ms`);
      console.log(`- 验证: ${(timer.getMarks()['validation'] - timer.getMarks()['batch-import']).toFixed(2)}ms`);
      console.log(`- 总耗时: ${totalTime.toFixed(2)}ms`);
      console.log(`- 平均每个配置: ${(totalTime / configCount).toFixed(2)}ms`);
      console.log(`- 内存使用: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    });

    test('大量配置查询性能测试', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      
      // 预先添加大量配置
      const configCount = 5000;
      for (let i = 0; i < configCount; i++) {
        const adapterName = `query-test-${i}`;
        multiAdapterManager.addAdapterConfig(
          adapterName,
          AdapterType.BINANCE,
          validBinanceConfig
        );
      }

      timer.start();

      // 执行大量查询操作
      const queryCount = 10000;
      for (let i = 0; i < queryCount; i++) {
        const randomIndex = Math.floor(Math.random() * configCount);
        const adapterName = `query-test-${randomIndex}`;
        const config = multiAdapterManager.getAdapterConfig(adapterName);
        expect(config).toBeDefined();
      }

      const queryTime = timer.end();

      // 性能断言
      expect(queryTime).toBeLessThan(1000); // 10000次查询应该在1秒内完成
      
      const avgQueryTime = queryTime / queryCount;
      expect(avgQueryTime).toBeLessThan(0.1); // 平均每次查询不超过0.1ms

      console.log(`查询性能测试结果:`);
      console.log(`- 查询次数: ${queryCount}`);
      console.log(`- 总耗时: ${queryTime.toFixed(2)}ms`);
      console.log(`- 平均查询时间: ${avgQueryTime.toFixed(4)}ms`);
      console.log(`- 查询速率: ${Math.round(queryCount / (queryTime / 1000))} 查询/秒`);
    });

    test('配置更新性能测试', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      
      // 添加初始配置
      const configCount = 1000;
      for (let i = 0; i < configCount; i++) {
        multiAdapterManager.addAdapterConfig(
          `update-test-${i}`,
          AdapterType.BINANCE,
          validBinanceConfig
        );
      }

      timer.start();

      // 执行大量更新操作
      for (let i = 0; i < configCount; i++) {
        const result = multiAdapterManager.updateAdapterConfig(
          `update-test-${i}`,
          AdapterType.BINANCE,
          {
            config: {
              enabled: i % 2 === 0 // 交替启用/禁用
            },
            subscription: {
              symbols: [`UPDATED${i}USDT`]
            }
          }
        );
        expect(result.success).toBe(true);
      }

      const updateTime = timer.end();

      // 性能断言
      expect(updateTime).toBeLessThan(5000); // 1000次更新应该在5秒内完成
      
      const avgUpdateTime = updateTime / configCount;
      expect(avgUpdateTime).toBeLessThan(5); // 平均每次更新不超过5ms

      console.log(`更新性能测试结果:`);
      console.log(`- 更新次数: ${configCount}`);
      console.log(`- 总耗时: ${updateTime.toFixed(2)}ms`);
      console.log(`- 平均更新时间: ${avgUpdateTime.toFixed(2)}ms`);
    });
  });

  describe('复杂配置操作性能', () => {
    
    test('大型配置对象处理性能', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      const memoryMonitor = ConfigTestHelper.createMemoryMonitor();

      memoryMonitor.start();
      timer.start();

      // 创建超大配置对象
      const megaConfig = ConfigTestHelper.deepClone(largeConfig);
      megaConfig.subscription.symbols = Array.from({ length: 10000 }, (_, i) => `MEGA${i}USDT`);
      megaConfig.subscription.customParams = {};
      
      // 添加大量自定义参数
      for (let i = 0; i < 1000; i++) {
        (megaConfig.subscription.customParams as any)[`param${i}`] = {
          value: TestDataGenerator.randomString(100),
          metadata: {
            created: Date.now(),
            version: i,
            data: Array.from({ length: 100 }, () => TestDataGenerator.randomNumber())
          }
        };
      }

      timer.mark('config-creation');

      // 添加配置
      const result = multiAdapterManager.addAdapterConfig(
        'mega-config',
        AdapterType.BINANCE,
        megaConfig
      );

      timer.mark('config-addition');

      expect(result.success).toBe(true);

      // 查询配置
      const retrievedConfig = multiAdapterManager.getAdapterConfig('mega-config');
      timer.mark('config-retrieval');

      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig?.subscription.symbols).toHaveLength(10000);

      const totalTime = timer.end();
      const finalMemory = memoryMonitor.stop();

      console.log(`大型配置处理性能:`);
      console.log(`- 配置创建: ${timer.getMarks()['config-creation'].toFixed(2)}ms`);
      console.log(`- 配置添加: ${(timer.getMarks()['config-addition'] - timer.getMarks()['config-creation']).toFixed(2)}ms`);
      console.log(`- 配置检索: ${(timer.getMarks()['config-retrieval'] - timer.getMarks()['config-addition']).toFixed(2)}ms`);
      console.log(`- 总耗时: ${totalTime.toFixed(2)}ms`);
      console.log(`- 内存使用: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
    });

    test('深度嵌套配置合并性能', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();

      // 创建深度嵌套的配置更新
      const deepUpdate: any = {
        subscription: {
          customParams: {}
        }
      };

      // 创建5层嵌套结构
      let current = deepUpdate.subscription.customParams;
      for (let i = 0; i < 5; i++) {
        current[`level${i}`] = {};
        current = current[`level${i}`];
      }

      // 在最深层添加大量数据
      for (let i = 0; i < 1000; i++) {
        current[`data${i}`] = {
          value: TestDataGenerator.randomString(50),
          array: Array.from({ length: 10 }, () => TestDataGenerator.randomNumber()),
          nested: {
            prop1: TestDataGenerator.randomString(20),
            prop2: TestDataGenerator.randomNumber(),
            prop3: TestDataGenerator.randomBoolean()
          }
        };
      }

      timer.start();

      // 执行深度合并
      const result = multiAdapterManager.addAdapterConfig(
        'deep-merge-test',
        AdapterType.BINANCE,
        deepUpdate,
        { deep: true }
      );

      const mergeTime = timer.end();

      expect(result.success).toBe(true);
      expect(mergeTime).toBeLessThan(1000); // 深度合并应该在1秒内完成

      console.log(`深度嵌套配置合并性能:`);
      console.log(`- 合并耗时: ${mergeTime.toFixed(2)}ms`);
    });
  });

  describe('并发操作性能', () => {
    
    test('并发配置操作性能', async () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      
      timer.start();

      // 创建并发操作Promise数组
      const concurrentOperations: Promise<any>[] = [];
      const operationCount = 100;

      // 并发添加配置
      for (let i = 0; i < operationCount; i++) {
        concurrentOperations.push(
          new Promise((resolve) => {
            const result = multiAdapterManager.addAdapterConfig(
              `concurrent-${i}`,
              AdapterType.BINANCE,
              {
                ...validBinanceConfig,
                subscription: {
                  ...validBinanceConfig.subscription,
                  symbols: [`CONCURRENT${i}USDT`]
                }
              }
            );
            resolve(result);
          })
        );
      }

      // 并发查询操作
      for (let i = 0; i < operationCount; i++) {
        concurrentOperations.push(
          new Promise((resolve) => {
            // 延迟查询以确保有些配置已经添加
            setTimeout(() => {
              const config = multiAdapterManager.getAdapterConfig(`concurrent-${i % 50}`);
              resolve(config);
            }, 10);
          })
        );
      }

      // 等待所有操作完成
      const results = await Promise.all(concurrentOperations);
      
      const concurrentTime = timer.end();

      // 验证添加操作的结果
      const addResults = results.slice(0, operationCount);
      const successCount = addResults.filter(result => result && result.success).length;
      
      expect(successCount).toBeGreaterThan(operationCount * 0.9); // 至少90%成功
      expect(concurrentTime).toBeLessThan(3000); // 并发操作应该在3秒内完成

      console.log(`并发操作性能测试:`);
      console.log(`- 操作数量: ${operationCount * 2}`);
      console.log(`- 总耗时: ${concurrentTime.toFixed(2)}ms`);
      console.log(`- 成功添加: ${successCount}/${operationCount}`);
    });

    test('高频配置更新性能', async () => {
      const timer = ConfigTestHelper.createPerformanceTimer();
      
      // 添加初始配置
      multiAdapterManager.addAdapterConfig('high-freq-test', AdapterType.BINANCE, validBinanceConfig);

      timer.start();

      // 执行高频更新
      const updateCount = 1000;
      for (let i = 0; i < updateCount; i++) {
        const result = multiAdapterManager.updateAdapterConfig(
          'high-freq-test',
          AdapterType.BINANCE,
          {
            subscription: {
              symbols: [`HIGHFREQ${i}USDT`]
            }
          }
        );
        expect(result.success).toBe(true);
      }

      const updateTime = timer.end();

      expect(updateTime).toBeLessThan(2000); // 1000次更新应该在2秒内完成

      // 验证最终状态
      const finalConfig = multiAdapterManager.getAdapterConfig('high-freq-test');
      expect(finalConfig?.subscription.symbols).toContain(`HIGHFREQ${updateCount - 1}USDT`);

      console.log(`高频更新性能测试:`);
      console.log(`- 更新次数: ${updateCount}`);
      console.log(`- 总耗时: ${updateTime.toFixed(2)}ms`);
      console.log(`- 更新频率: ${Math.round(updateCount / (updateTime / 1000))} 更新/秒`);
    });
  });

  describe('内存使用优化', () => {
    
    test('内存泄漏检测', () => {
      const memoryMonitor = ConfigTestHelper.createMemoryMonitor();
      
      memoryMonitor.start();
      const initialMemory = memoryMonitor.getUsage();

      // 执行大量配置操作
      for (let i = 0; i < 1000; i++) {
        // 添加配置
        multiAdapterManager.addAdapterConfig(
          `memory-test-${i}`,
          AdapterType.BINANCE,
          validBinanceConfig
        );

        // 更新配置
        multiAdapterManager.updateAdapterConfig(
          `memory-test-${i}`,
          AdapterType.BINANCE,
          { config: { enabled: false } }
        );

        // 删除配置
        if (i % 2 === 0) {
          multiAdapterManager.removeAdapterConfig(`memory-test-${i}`);
        }
      }

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      const finalMemory = memoryMonitor.stop();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // 内存增长应该在合理范围内
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 不超过50MB

      console.log(`内存使用测试:`);
      console.log(`- 初始内存: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`- 最终内存: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`- 内存增长: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    });

    test('大对象序列化性能', () => {
      const timer = ConfigTestHelper.createPerformanceTimer();

      // 创建包含大量配置的管理器
      for (let i = 0; i < 1000; i++) {
        multiAdapterManager.addAdapterConfig(
          `serialize-test-${i}`,
          AdapterType.BINANCE,
          validBinanceConfig
        );
      }

      timer.start();

      // 执行序列化操作
      const exported = multiAdapterManager.exportConfigs();
      timer.mark('export');

      // 验证序列化结果
      expect(Object.keys(exported)).toHaveLength(1000);
      timer.mark('validation');

      const serializationTime = timer.end();

      expect(serializationTime).toBeLessThan(1000); // 序列化应该在1秒内完成

      console.log(`序列化性能测试:`);
      console.log(`- 配置数量: 1000`);
      console.log(`- 导出耗时: ${timer.getMarks()['export'].toFixed(2)}ms`);
      console.log(`- 验证耗时: ${(timer.getMarks()['validation'] - timer.getMarks()['export']).toFixed(2)}ms`);
      console.log(`- 总耗时: ${serializationTime.toFixed(2)}ms`);
    });
  });

  describe('性能基准测试', () => {
    
    test('配置系统性能基准', () => {
      const benchmarks: { [operation: string]: number } = {};
      
      // 基准测试：添加单个配置
      let timer = ConfigTestHelper.createPerformanceTimer();
      timer.start();
      multiAdapterManager.addAdapterConfig('benchmark-add', AdapterType.BINANCE, validBinanceConfig);
      benchmarks['单个配置添加'] = timer.end();

      // 基准测试：查询单个配置
      timer = ConfigTestHelper.createPerformanceTimer();
      timer.start();
      multiAdapterManager.getAdapterConfig('benchmark-add');
      benchmarks['单个配置查询'] = timer.end();

      // 基准测试：更新单个配置
      timer = ConfigTestHelper.createPerformanceTimer();
      timer.start();
      multiAdapterManager.updateAdapterConfig(
        'benchmark-add',
        AdapterType.BINANCE,
        { config: { enabled: false } }
      );
      benchmarks['单个配置更新'] = timer.end();

      // 基准测试：验证单个配置
      timer = ConfigTestHelper.createPerformanceTimer();
      timer.start();
      multiAdapterManager.validateAllConfigs();
      benchmarks['配置验证'] = timer.end();

      // 基准测试：删除单个配置
      timer = ConfigTestHelper.createPerformanceTimer();
      timer.start();
      multiAdapterManager.removeAdapterConfig('benchmark-add');
      benchmarks['单个配置删除'] = timer.end();

      console.log('\n配置系统性能基准:');
      Object.entries(benchmarks).forEach(([operation, time]) => {
        console.log(`- ${operation}: ${time.toFixed(4)}ms`);
      });

      // 性能断言
      expect(benchmarks['单个配置添加']).toBeLessThan(10); // 单个添加不超过10ms
      expect(benchmarks['单个配置查询']).toBeLessThan(1); // 单个查询不超过1ms
      expect(benchmarks['单个配置更新']).toBeLessThan(10); // 单个更新不超过10ms
      expect(benchmarks['配置验证']).toBeLessThan(5); // 单个验证不超过5ms
      expect(benchmarks['单个配置删除']).toBeLessThan(5); // 单个删除不超过5ms
    });
  });
});