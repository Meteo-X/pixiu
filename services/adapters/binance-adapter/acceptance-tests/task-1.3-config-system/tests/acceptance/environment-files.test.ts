/**
 * 验收测试 - 环境配置文件测试
 * 
 * 验证任务 1.3 中的开发环境配置文件功能：
 * - 配置文件存在性和格式正确性
 * - 配置文件内容的有效性
 * - 环境特定配置的正确性
 * - 配置文件与代码预设的一致性
 */

import { resolve } from 'path';
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import {
  loadConfigFromFile,
  validateConfig,
  createDevelopmentConfig,
  createTestingConfig,
  createProductionConfig,
  BinanceAdapterConfig
} from '../../../../../src/config';

describe('验收测试 - 环境配置文件', () => {
  const configDir = resolve(__dirname, '../../../../../config');

  describe('配置文件存在性验证', () => {
    test('development.yaml 文件应该存在', async () => {
      const devConfigPath = resolve(configDir, 'development.yaml');
      const exists = await fs.access(devConfigPath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
    });

    test('testing.yaml 文件应该存在', async () => {
      const testConfigPath = resolve(configDir, 'testing.yaml');
      const exists = await fs.access(testConfigPath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
    });

    test('production.yaml 文件应该存在', async () => {
      const prodConfigPath = resolve(configDir, 'production.yaml');
      const exists = await fs.access(prodConfigPath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
    });
  });

  describe('配置文件格式验证', () => {
    test('development.yaml 应该是有效的 YAML 格式', async () => {
      const devConfigPath = resolve(configDir, 'development.yaml');
      const content = await fs.readFile(devConfigPath, 'utf8');
      
      expect(() => yaml.load(content)).not.toThrow();
      
      const parsed = yaml.load(content);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
    });

    test('testing.yaml 应该是有效的 YAML 格式', async () => {
      const testConfigPath = resolve(configDir, 'testing.yaml');
      const content = await fs.readFile(testConfigPath, 'utf8');
      
      expect(() => yaml.load(content)).not.toThrow();
      
      const parsed = yaml.load(content);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
    });

    test('production.yaml 应该是有效的 YAML 格式', async () => {
      const prodConfigPath = resolve(configDir, 'production.yaml');
      const content = await fs.readFile(prodConfigPath, 'utf8');
      
      expect(() => yaml.load(content)).not.toThrow();
      
      const parsed = yaml.load(content);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
    });
  });

  describe('配置文件加载验证', () => {
    test('development.yaml 应该能被配置加载器正确加载', async () => {
      const devConfigPath = resolve(configDir, 'development.yaml');
      
      const loaded = await loadConfigFromFile(devConfigPath);
      
      expect(loaded).toBeDefined();
      expect(typeof loaded).toBe('object');
    });

    test('testing.yaml 应该能被配置加载器正确加载', async () => {
      const testConfigPath = resolve(configDir, 'testing.yaml');
      
      const loaded = await loadConfigFromFile(testConfigPath);
      
      expect(loaded).toBeDefined();
      expect(typeof loaded).toBe('object');
    });

    test('production.yaml 应该能被配置加载器正确加载', async () => {
      const prodConfigPath = resolve(configDir, 'production.yaml');
      
      const loaded = await loadConfigFromFile(prodConfigPath);
      
      expect(loaded).toBeDefined();
      expect(typeof loaded).toBe('object');
    });
  });

  describe('开发环境配置文件验证', () => {
    let devFileConfig: Partial<BinanceAdapterConfig>;

    beforeAll(async () => {
      const devConfigPath = resolve(configDir, 'development.yaml');
      devFileConfig = await loadConfigFromFile(devConfigPath);
    });

    test('应包含正确的基础配置', () => {
      expect(devFileConfig.wsEndpoint).toBeValidUrl(['wss:']);
      expect(devFileConfig.restEndpoint).toBeValidUrl(['https:']);
      expect(devFileConfig.environment).toBe('development');
    });

    test('应包含适合开发环境的连接配置', () => {
      expect(devFileConfig.connection).toBeDefined();
      expect(devFileConfig.connection!.maxConnections).toBePositiveInteger();
      expect(devFileConfig.connection!.maxConnections).toBeLessThanOrEqual(5);
      expect(devFileConfig.connection!.maxStreamsPerConnection).toBePositiveInteger();
      expect(devFileConfig.connection!.maxStreamsPerConnection).toBeLessThanOrEqual(200);
    });

    test('应包含适合开发环境的重试配置', () => {
      expect(devFileConfig.retry).toBeDefined();
      expect(devFileConfig.retry!.maxRetries).toBePositiveInteger();
      expect(devFileConfig.retry!.maxRetries).toBeLessThanOrEqual(20);
      expect(devFileConfig.retry!.maxDelay).toBeLessThanOrEqual(30000);
    });

    test('应包含适合开发环境的订阅配置', () => {
      expect(devFileConfig.subscriptions).toBeDefined();
      expect(Array.isArray(devFileConfig.subscriptions!.defaultSymbols)).toBe(true);
      expect(devFileConfig.subscriptions!.defaultSymbols.length).toBeGreaterThan(0);
      
      // 开发环境应该有较少的默认符号
      expect(devFileConfig.subscriptions!.defaultSymbols.length).toBeLessThanOrEqual(10);
      
      // 验证符号格式
      for (const symbol of devFileConfig.subscriptions!.defaultSymbols) {
        expect(symbol).toMatch(/^[A-Z]{2,}[A-Z]{2,}$/);
      }
    });

    test('应包含适合开发环境的日志配置', () => {
      expect(devFileConfig.logging).toBeDefined();
      expect(devFileConfig.logging!.level).toBe('debug');
      expect(['json', 'text']).toContain(devFileConfig.logging!.format);
    });

    test('应包含适合开发环境的监控配置', () => {
      expect(devFileConfig.monitoring).toBeDefined();
      expect(devFileConfig.monitoring!.prometheus).toBeDefined();
      expect(typeof devFileConfig.monitoring!.prometheus.enabled).toBe('boolean');
      
      if (devFileConfig.monitoring!.prometheus.enabled) {
        expect(devFileConfig.monitoring!.prometheus.port).not.toBe(9090); // 不应与生产环境冲突
      }
    });

    test('应包含适合开发环境的 Google Cloud 配置', () => {
      expect(devFileConfig.googleCloud).toBeDefined();
      expect(devFileConfig.googleCloud!.projectId).toMatch(/dev|development/i);
      
      if (devFileConfig.googleCloud!.pubsub) {
        expect(devFileConfig.googleCloud!.pubsub.emulatorHost).toBeDefined();
        expect(devFileConfig.googleCloud!.pubsub.emulatorHost).toMatch(/localhost:\d+/);
      }
    });
  });

  describe('测试环境配置文件验证', () => {
    let testFileConfig: Partial<BinanceAdapterConfig>;

    beforeAll(async () => {
      const testConfigPath = resolve(configDir, 'testing.yaml');
      testFileConfig = await loadConfigFromFile(testConfigPath);
    });

    test('应包含正确的基础配置', () => {
      expect(testFileConfig.environment).toBe('testing');
      expect(testFileConfig.wsEndpoint).toBeValidUrl(['wss:']);
      expect(testFileConfig.restEndpoint).toBeValidUrl(['https:']);
    });

    test('应包含适合测试环境的连接配置', () => {
      expect(testFileConfig.connection).toBeDefined();
      // 测试环境应该有更小的连接数和超时时间
      expect(testFileConfig.connection!.maxConnections).toBeLessThanOrEqual(3);
      expect(testFileConfig.connection!.maxStreamsPerConnection).toBeLessThanOrEqual(100);
      expect(testFileConfig.connection!.connectionTimeout).toBeLessThanOrEqual(20000);
    });

    test('应包含适合测试环境的重试配置', () => {
      expect(testFileConfig.retry).toBeDefined();
      // 测试环境应该有更少的重试和更短的延迟
      expect(testFileConfig.retry!.maxRetries).toBeLessThanOrEqual(10);
      expect(testFileConfig.retry!.maxDelay).toBeLessThanOrEqual(20000);
    });

    test('应包含适合测试环境的监控配置', () => {
      expect(testFileConfig.monitoring).toBeDefined();
      // 测试环境可能禁用 Prometheus
      if (testFileConfig.monitoring!.prometheus.enabled === false) {
        expect(testFileConfig.monitoring!.prometheus.port).toBe(0);
      }
    });
  });

  describe('生产环境配置文件验证', () => {
    let prodFileConfig: Partial<BinanceAdapterConfig>;

    beforeAll(async () => {
      const prodConfigPath = resolve(configDir, 'production.yaml');
      prodFileConfig = await loadConfigFromFile(prodConfigPath);
    });

    test('应包含正确的基础配置', () => {
      expect(prodFileConfig.environment).toBe('production');
      expect(prodFileConfig.wsEndpoint).toBeValidUrl(['wss:']);
      expect(prodFileConfig.restEndpoint).toBeValidUrl(['https:']);
    });

    test('应包含适合生产环境的连接配置', () => {
      expect(prodFileConfig.connection).toBeDefined();
      // 生产环境应该有更高的连接数和容量
      expect(prodFileConfig.connection!.maxConnections).toBeGreaterThanOrEqual(5);
      expect(prodFileConfig.connection!.maxStreamsPerConnection).toBeGreaterThanOrEqual(500);
    });

    test('应包含适合生产环境的重试配置', () => {
      expect(prodFileConfig.retry).toBeDefined();
      // 生产环境应该有更多的重试机会
      expect(prodFileConfig.retry!.maxRetries).toBeGreaterThanOrEqual(30);
    });

    test('应包含适合生产环境的凭据配置', () => {
      if (prodFileConfig.credentials) {
        expect(prodFileConfig.credentials.useSecretManager).toBe(true);
        expect(prodFileConfig.credentials.secretName).toBeDefined();
        expect(prodFileConfig.credentials.secretName).toMatch(/prod|production/i);
      }
    });

    test('应包含适合生产环境的日志配置', () => {
      expect(prodFileConfig.logging).toBeDefined();
      expect(prodFileConfig.logging!.level).toBeIn(['info', 'warn', 'error']);
      expect(prodFileConfig.logging!.format).toBe('json');
      expect(prodFileConfig.logging!.structured).toBe(true);
    });

    test('应包含适合生产环境的监控配置', () => {
      expect(prodFileConfig.monitoring).toBeDefined();
      expect(prodFileConfig.monitoring!.prometheus.enabled).toBe(true);
      expect(prodFileConfig.monitoring!.prometheus.port).toBePositiveInteger();
      
      // 健康检查间隔应该适合生产环境
      expect(prodFileConfig.monitoring!.healthCheck.interval).toBeGreaterThanOrEqual(30000);
    });

    test('应包含适合生产环境的 Google Cloud 配置', () => {
      expect(prodFileConfig.googleCloud).toBeDefined();
      expect(prodFileConfig.googleCloud!.projectId).toMatch(/prod|production/i);
      
      if (prodFileConfig.googleCloud!.pubsub) {
        // 生产环境不应该使用模拟器
        expect(prodFileConfig.googleCloud!.pubsub.emulatorHost).toBeUndefined();
      }
      
      if (prodFileConfig.googleCloud!.monitoring) {
        expect(prodFileConfig.googleCloud!.monitoring.enabled).toBe(true);
      }
    });
  });

  describe('配置文件与代码预设一致性验证', () => {
    test('development.yaml 与 createDevelopmentConfig() 应该兼容', async () => {
      const fileConfig = await loadConfigFromFile(resolve(configDir, 'development.yaml'));
      const codeConfig = createDevelopmentConfig();
      
      // 应该有相同的环境
      expect(fileConfig.environment).toBe(codeConfig.environment);
      
      // 如果文件配置指定了相同的字段，数值应该合理
      if (fileConfig.connection?.maxConnections) {
        expect(fileConfig.connection.maxConnections).toBeLessThanOrEqual(codeConfig.connection.maxConnections * 2);
      }
      
      if (fileConfig.logging?.level) {
        expect(fileConfig.logging.level).toBe(codeConfig.logging.level);
      }
    });

    test('testing.yaml 与 createTestingConfig() 应该兼容', async () => {
      const fileConfig = await loadConfigFromFile(resolve(configDir, 'testing.yaml'));
      const codeConfig = createTestingConfig();
      
      // 应该有相同的环境
      expect(fileConfig.environment).toBe(codeConfig.environment);
      
      // 测试环境特定的验证
      if (fileConfig.connection?.maxConnections) {
        expect(fileConfig.connection.maxConnections).toBeLessThanOrEqual(codeConfig.connection.maxConnections);
      }
      
      if (fileConfig.monitoring?.prometheus?.enabled !== undefined) {
        expect(fileConfig.monitoring.prometheus.enabled).toBe(codeConfig.monitoring.prometheus.enabled);
      }
    });

    test('production.yaml 与 createProductionConfig() 应该兼容', async () => {
      const fileConfig = await loadConfigFromFile(resolve(configDir, 'production.yaml'));
      const codeConfig = createProductionConfig();
      
      // 应该有相同的环境
      expect(fileConfig.environment).toBe(codeConfig.environment);
      
      // 生产环境特定的验证
      if (fileConfig.credentials?.useSecretManager !== undefined) {
        expect(fileConfig.credentials.useSecretManager).toBe(codeConfig.credentials?.useSecretManager);
      }
      
      if (fileConfig.logging?.level) {
        expect(fileConfig.logging.level).toBe(codeConfig.logging.level);
      }
    });
  });

  describe('配置文件验证一致性', () => {
    test('所有配置文件都应该通过验证', async () => {
      const configFiles = ['development.yaml', 'testing.yaml', 'production.yaml'];
      
      for (const configFile of configFiles) {
        const configPath = resolve(configDir, configFile);
        const fileConfig = await loadConfigFromFile(configPath);
        
        // 将文件配置与相应的环境预设合并进行验证
        const envName = configFile.replace('.yaml', '') as 'development' | 'testing' | 'production';
        let baseConfig: BinanceAdapterConfig;
        
        switch (envName) {
          case 'development':
            baseConfig = createDevelopmentConfig();
            break;
          case 'testing':
            baseConfig = createTestingConfig();
            break;
          case 'production':
            baseConfig = createProductionConfig();
            break;
        }
        
        // 合并配置
        const mergedConfig = { ...baseConfig, ...fileConfig };
        
        // 验证合并后的配置
        const validation = validateConfig(mergedConfig);
        
        if (!validation.valid) {
          console.error(`Validation errors in ${configFile}:`, validation.errors);
        }
        
        expect(validation.valid).toBe(true);
      }
    });

    test('配置文件之间应该有明显的环境差异', async () => {
      const devConfig = await loadConfigFromFile(resolve(configDir, 'development.yaml'));
      const testConfig = await loadConfigFromFile(resolve(configDir, 'testing.yaml'));
      const prodConfig = await loadConfigFromFile(resolve(configDir, 'production.yaml'));
      
      // 环境标识应该不同
      expect(devConfig.environment).toBe('development');
      expect(testConfig.environment).toBe('testing');
      expect(prodConfig.environment).toBe('production');
      
      // 日志级别应该有差异
      if (devConfig.logging?.level && prodConfig.logging?.level) {
        expect(devConfig.logging.level).not.toBe(prodConfig.logging.level);
      }
      
      // 连接配置应该有差异（测试 <= 开发 <= 生产）
      if (testConfig.connection?.maxConnections && 
          devConfig.connection?.maxConnections && 
          prodConfig.connection?.maxConnections) {
        expect(testConfig.connection.maxConnections)
          .toBeLessThanOrEqual(devConfig.connection.maxConnections);
        expect(devConfig.connection.maxConnections)
          .toBeLessThanOrEqual(prodConfig.connection.maxConnections);
      }
    });
  });

  describe('配置文件安全性验证', () => {
    test('配置文件不应包含硬编码的敏感信息', async () => {
      const configFiles = ['development.yaml', 'testing.yaml', 'production.yaml'];
      
      for (const configFile of configFiles) {
        const configPath = resolve(configDir, configFile);
        const content = await fs.readFile(configPath, 'utf8');
        
        // 检查不应该包含的敏感信息模式
        const sensitivePatterns = [
          /apiKey:\s*['"]\w{20,}['"]/, // 硬编码的 API Key
          /apiSecret:\s*['"]\w{20,}['"]/, // 硬编码的 API Secret
          /password:\s*['"].+['"]/, // 硬编码的密码
          /token:\s*['"].+['"]/, // 硬编码的 token
        ];
        
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            fail(`Configuration file ${configFile} contains hardcoded sensitive information matching pattern: ${pattern}`);
          }
        }
      }
    });

    test('生产环境配置应该使用 Secret Manager', async () => {
      const prodConfig = await loadConfigFromFile(resolve(configDir, 'production.yaml'));
      
      if (prodConfig.credentials) {
        expect(prodConfig.credentials.useSecretManager).toBe(true);
        expect(prodConfig.credentials.secretName).toBeDefined();
        expect(prodConfig.credentials.apiKey).toBeUndefined();
        expect(prodConfig.credentials.apiSecret).toBeUndefined();
      }
    });
  });
});