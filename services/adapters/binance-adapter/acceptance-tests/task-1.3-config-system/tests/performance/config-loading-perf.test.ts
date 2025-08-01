/**
 * 性能测试 - 配置加载性能
 * 
 * 测试配置系统的性能特征：
 * - 配置加载速度
 * - 内存使用效率
 * - 并发访问性能
 * - 缓存效果测试
 * - 大配置文件处理性能
 */

import { resolve } from 'path';
import {
  loadConfig,
  loadConfigFromFile,
  loadConfigFromEnv,
  getEnvironmentConfig,
  validateConfig,
  ConfigManager,
  createConfigManager,
  loadCredentialsFromSecretManager,
  clearCredentialsCache
} from '../../../../../src/config';
import { ConfigFactory } from '../../fixtures/helpers/config-factory';
import { FileTestUtils, PerformanceTestUtils } from '../../fixtures/helpers/test-utils';

// Mock Secret Manager for performance tests
jest.mock('@google-cloud/secret-manager');

describe('性能测试 - 配置加载性能', () => {
  afterAll(async () => {
    await FileTestUtils.cleanupTempDir();
  });

  describe('基础配置加载性能', () => {
    test('环境预设配置加载应在合理时间内完成', async () => {
      const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
        () => getEnvironmentConfig('development'),
        10
      );

      expect(result).toBeDefined();
      expect(avgTime).toBeLessThan(5); // 应在 5ms 内完成
    });

    test('环境变量配置加载应高效', async () => {
      // 设置多个环境变量
      const envVars = {
        'BINANCE_WS_ENDPOINT': 'wss://stream.binance.com:9443',
        'BINANCE_REST_ENDPOINT': 'https://api.binance.com',
        'NODE_ENV': 'testing',
        'BINANCE_MAX_CONNECTIONS': '10',
        'BINANCE_MAX_STREAMS_PER_CONNECTION': '1000',
        'LOG_LEVEL': 'info'
      };

      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfigFromEnv(),
          50
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(2); // 应在 2ms 内完成
      } finally {
        // 清理环境变量
        for (const key of Object.keys(envVars)) {
          delete process.env[key];
        }
      }
    });

    test('JSON 配置文件加载性能', async () => {
      const config = ConfigFactory.createValidConfig();
      const configFile = await FileTestUtils.createTempConfigFile(config, 'json');

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfigFromFile(configFile),
          20
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(50); // 应在 50ms 内完成
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('YAML 配置文件加载性能', async () => {
      const config = ConfigFactory.createValidConfig();
      const configFile = await FileTestUtils.createTempConfigFile(config, 'yaml');

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfigFromFile(configFile),
          20
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(100); // YAML 解析可能稍慢，应在 100ms 内完成
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('完整配置加载性能（三层合并）', async () => {
      const config = ConfigFactory.createValidConfig();
      const configFile = await FileTestUtils.createTempConfigFile(config, 'json');

      // 设置环境变量
      process.env['NODE_ENV'] = 'development';
      process.env['BINANCE_MAX_CONNECTIONS'] = '8';

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfig(configFile),
          15
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(150); // 三层合并应在 150ms 内完成
      } finally {
        await FileTestUtils.removeTempFile(configFile);
        delete process.env['NODE_ENV'];
        delete process.env['BINANCE_MAX_CONNECTIONS'];
      }
    });
  });

  describe('配置验证性能', () => {
    test('有效配置验证性能', async () => {
      const config = ConfigFactory.createValidConfig();

      const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
        () => validateConfig(config),
        100
      );

      expect(result.valid).toBe(true);
      expect(avgTime).toBeLessThan(10); // 验证应在 10ms 内完成
    });

    test('无效配置验证性能', async () => {
      const invalidConfig = ConfigFactory.createInvalidConfig('wrong-types');

      const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
        () => validateConfig(invalidConfig as any),
        50
      );

      expect(result.valid).toBe(false);
      expect(avgTime).toBeLessThan(15); // 即使验证失败，也应在 15ms 内完成
    });

    test('复杂配置验证性能', async () => {
      const complexConfig = ConfigFactory.createValidConfig({
        withCredentials: true,
        withGoogleCloud: true
      });

      // 添加大量订阅符号
      complexConfig.subscriptions.defaultSymbols = Array.from(
        { length: 200 },
        (_, i) => `SYM${i}USDT`
      );

      const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
        () => validateConfig(complexConfig),
        30
      );

      expect(result).toBeDefined();
      expect(avgTime).toBeLessThan(25); // 复杂配置验证应在 25ms 内完成
    });
  });

  describe('ConfigManager 性能', () => {
    test('ConfigManager 初始化性能', async () => {
      const { result: manager, avgTime } = await PerformanceTestUtils.measureExecutionTime(
        async () => {
          const mgr = createConfigManager();
          await mgr.initialize();
          return mgr;
        },
        5
      );

      expect(manager.isConfigLoaded()).toBe(true);
      expect(avgTime).toBeLessThan(200); // 初始化应在 200ms 内完成

      manager.destroy();
    });

    test('配置获取性能', async () => {
      const manager = createConfigManager();
      await manager.initialize();

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => manager.getConfig(),
          1000
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(1); // 配置获取应非常快，< 1ms
      } finally {
        manager.destroy();
      }
    });

    test('配置摘要生成性能', async () => {
      const manager = createConfigManager();
      await manager.initialize();

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => manager.getConfigSummary(),
          100
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(5); // 摘要生成应在 5ms 内完成
      } finally {
        manager.destroy();
      }
    });

    test('配置验证性能', async () => {
      const manager = createConfigManager();
      await manager.initialize();

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => manager.validateCurrentConfig(),
          50
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(15); // 配置验证应在 15ms 内完成
      } finally {
        manager.destroy();
      }
    });
  });

  describe('大配置文件处理性能', () => {
    test('处理大量订阅符号的配置', async () => {
      const largeConfig = ConfigFactory.createValidConfig();
      
      // 生成 1000 个订阅符号
      largeConfig.subscriptions.defaultSymbols = Array.from(
        { length: 1000 },
        (_, i) => `SYMBOL${i}USDT`
      );

      const configFile = await FileTestUtils.createTempConfigFile(largeConfig, 'json');

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfigFromFile(configFile),
          10
        );

        expect(result).toBeDefined();
        expect(result.subscriptions?.defaultSymbols).toHaveLength(1000);
        expect(avgTime).toBeLessThan(200); // 大配置文件应在 200ms 内完成
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('处理复杂嵌套配置结构', async () => {
      const complexConfig = ConfigFactory.createValidConfig({
        withCredentials: true,
        withGoogleCloud: true
      });

      // 添加复杂的 Google Cloud 配置
      complexConfig.googleCloud = {
        projectId: 'complex-project',
        pubsub: {
          enabled: true,
          topicPrefix: 'complex-market',
          publishSettings: {
            enableMessageOrdering: true,
            batchSettings: {
              maxMessages: 1000,
              maxBytes: 10485760,
              maxLatency: 50
            },
            retrySettings: {
              maxRetries: 5,
              initialRetryDelay: 100,
              maxRetryDelay: 5000
            }
          }
        },
        monitoring: {
          enabled: true,
          metricPrefix: 'complex/metrics'
        }
      };

      const configFile = await FileTestUtils.createTempConfigFile(complexConfig, 'json');

      try {
        const { result, avgTime } = await PerformanceTestUtils.measureExecutionTime(
          () => loadConfigFromFile(configFile),
          10
        );

        expect(result).toBeDefined();
        expect(avgTime).toBeLessThan(100); // 复杂配置应在 100ms 内完成
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });
  });

  describe('并发访问性能', () => {
    test('并发配置加载性能', async () => {
      const config = ConfigFactory.createValidConfig();
      const configFile = await FileTestUtils.createTempConfigFile(config, 'json');

      try {
        const { results, totalTime, avgTime } = await PerformanceTestUtils.runConcurrentTests(
          () => loadConfigFromFile(configFile),
          5, // 并发数
          20  // 总次数
        );

        expect(results).toHaveLength(20);
        expect(totalTime).toBeLessThan(1000); // 并发加载应在 1s 内完成
        expect(avgTime).toBeLessThan(100); // 平均时间应合理
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('并发配置验证性能', async () => {
      const config = ConfigFactory.createValidConfig();

      const { results, totalTime } = await PerformanceTestUtils.runConcurrentTests(
        () => validateConfig(config),
        10, // 并发数
        50  // 总次数
      );

      expect(results).toHaveLength(50);
      expect(results.every(r => r.valid)).toBe(true);
      expect(totalTime).toBeLessThan(1000); // 并发验证应在 1s 内完成
    });

    test('并发 ConfigManager 访问性能', async () => {
      const manager = createConfigManager();
      await manager.initialize();

      try {
        const { results, totalTime } = await PerformanceTestUtils.runConcurrentTests(
          () => manager.getConfig(),
          20, // 并发数
          100 // 总次数
        );

        expect(results).toHaveLength(100);
        expect(totalTime).toBeLessThan(500); // 并发访问应在 500ms 内完成
      } finally {
        manager.destroy();
      }
    });
  });

  describe('内存使用性能', () => {
    test('配置加载内存使用', async () => {
      const config = ConfigFactory.createValidConfig();
      const configFile = await FileTestUtils.createTempConfigFile(config, 'json');

      try {
        const { result, memoryUsed } = PerformanceTestUtils.measureMemoryUsage(
          () => {
            // 加载配置多次以测量内存使用
            const configs = [];
            for (let i = 0; i < 100; i++) {
              configs.push(getEnvironmentConfig('development'));
            }
            return configs;
          }
        );

        expect(result).toHaveLength(100);
        expect(memoryUsed).toBeLessThan(10 * 1024 * 1024); // 应少于 10MB
      } finally {
        await FileTestUtils.removeTempFile(configFile);
      }
    });

    test('ConfigManager 内存使用', async () => {
      const { result: managers, memoryUsed } = PerformanceTestUtils.measureMemoryUsage(
        () => {
          // 创建多个 ConfigManager 实例
          const managers = [];
          for (let i = 0; i < 10; i++) {
            managers.push(createConfigManager());
          }
          return managers;
        }
      );

      try {
        expect(managers).toHaveLength(10);
        expect(memoryUsed).toBeLessThan(5 * 1024 * 1024); // 应少于 5MB
      } finally {
        // 清理资源
        managers.forEach(manager => manager.destroy());
      }
    });
  });

  describe('缓存性能测试', () => {
    beforeEach(() => {
      clearCredentialsCache();
    });

    test('凭据缓存访问性能', async () => {
      const projectId = 'test-project';
      const secretName = 'test-credentials';

      // 首次加载（实际请求）
      const { avgTime: firstLoadTime } = await PerformanceTestUtils.measureExecutionTime(
        () => loadCredentialsFromSecretManager(projectId, secretName, true),
        1
      );

      // 缓存访问（多次）
      const { avgTime: cachedLoadTime } = await PerformanceTestUtils.measureExecutionTime(
        () => loadCredentialsFromSecretManager(projectId, secretName, true),
        50
      );

      expect(cachedLoadTime).toBeLessThan(firstLoadTime / 2); // 缓存应该显著更快
      expect(cachedLoadTime).toBeLessThan(5); // 缓存访问应在 5ms 内
    });

    test('并发缓存访问性能', async () => {
      const projectId = 'test-project';
      const secretName = 'test-credentials';

      // 预加载缓存
      await loadCredentialsFromSecretManager(projectId, secretName, true);

      const { results, totalTime } = await PerformanceTestUtils.runConcurrentTests(
        () => loadCredentialsFromSecretManager(projectId, secretName, true),
        20, // 并发数
        100 // 总次数
      );

      expect(results).toHaveLength(100);
      expect(totalTime).toBeLessThan(1000); // 并发缓存访问应在 1s 内完成
    });
  });

  describe('性能回归基准', () => {
    test('配置加载性能基准', async () => {
      // 设置性能基准 - 这些数值应该随着优化而改进
      const benchmarks = {
        environmentConfig: 5,     // 5ms
        envVarLoading: 2,         // 2ms
        jsonFileLoading: 50,      // 50ms
        yamlFileLoading: 100,     // 100ms
        fullConfigLoading: 150,   // 150ms
        configValidation: 10,     // 10ms
        managerInit: 200,         // 200ms
        configRetrieval: 1        // 1ms
      };

      // 运行基准测试
      const results = {
        environmentConfig: (await PerformanceTestUtils.measureExecutionTime(
          () => getEnvironmentConfig('development'), 10
        )).avgTime,
        
        envVarLoading: (() => {
          process.env['NODE_ENV'] = 'testing';
          const time = PerformanceTestUtils.measureExecutionTime(
            () => loadConfigFromEnv(), 50
          );
          delete process.env['NODE_ENV'];
          return time;
        })().avgTime,
        
        configValidation: (await PerformanceTestUtils.measureExecutionTime(
          () => validateConfig(ConfigFactory.createValidConfig()), 100
        )).avgTime
      };

      // 验证性能不会显著退化（允许 20% 的波动）
      for (const [test, result] of Object.entries(results)) {
        const benchmark = benchmarks[test as keyof typeof benchmarks];
        expect(result).toBeLessThan(benchmark * 1.2); // 不超过基准的 120%
      }

      // 输出性能结果用于监控
      console.log('Performance Benchmark Results:', results);
    });
  });
});