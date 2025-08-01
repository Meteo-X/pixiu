/**
 * 集成测试 - Secret Manager 集成
 * 
 * 测试 Google Secret Manager 集成功能：
 * - Mock Secret Manager 客户端行为
 * - 凭据加载和缓存
 * - 错误处理和降级机制
 * - 缓存管理和刷新
 * - 安全性验证
 */

import {
  loadCredentialsFromSecretManager,
  checkSecretManagerAvailable,
  createOrUpdateSecret,
  deleteSecret,
  listBinanceSecrets,
  clearCredentialsCache,
  getCacheStats,
  cleanupExpiredCache,
  ConfigurationError
} from '../../../../../src/config';
import {
  MockSecretManagerServiceClient,
  mockSecretStorage,
  MockScenarios
} from '../../fixtures/mock-secrets/secret-manager-mock';

// Mock Google Cloud Secret Manager
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: MockSecretManagerServiceClient
}));

describe('集成测试 - Secret Manager 集成', () => {
  const testProjectId = 'test-project';

  beforeEach(() => {
    // 重置 mock 数据
    MockScenarios.reset();
    mockSecretStorage.setProjectId(testProjectId);
    clearCredentialsCache();
  });

  afterEach(() => {
    // 清理缓存
    clearCredentialsCache();
  });

  describe('Secret Manager 可用性检查', () => {
    test('应能检查 Secret Manager 是否可用', async () => {
      const available = await checkSecretManagerAvailable(testProjectId);
      expect(available).toBe(true);
    });

    test('应在项目不存在时返回 false', async () => {
      const available = await checkSecretManagerAvailable('nonexistent-project');
      expect(available).toBe(false);
    });

    test('应在网络错误时返回 false', async () => {
      // 临时修改项目 ID 触发错误
      mockSecretStorage.setProjectId('error-project');
      
      const available = await checkSecretManagerAvailable('error-project');
      expect(available).toBe(false);
      
      // 恢复正常项目 ID
      mockSecretStorage.setProjectId(testProjectId);
    });
  });

  describe('凭据加载功能', () => {
    test('应能从 Secret Manager 加载有效凭据', async () => {
      const credentials = await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials'
      );

      expect(credentials).toBeDefined();
      expect(credentials.apiKey).toBe('test-api-key-12345678901234567890');
      expect(credentials.apiSecret).toBe('test-api-secret-12345678901234567890abcdef');
      expect(credentials.useSecretManager).toBe(true);
      expect(credentials.secretName).toBe('binance-test-credentials');
    });

    test('应能加载生产环境凭据', async () => {
      const credentials = await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-prod-credentials'
      );

      expect(credentials).toBeDefined();
      expect(credentials.apiKey).toBe('prod-api-key-abcdefghijklmnopqrstuvwxyz');
      expect(credentials.apiSecret).toBe('prod-api-secret-zyxwvutsrqponmlkjihgfedcba123456');
    });

    test('应在 secret 不存在时抛出错误', async () => {
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'nonexistent-secret'
      )).rejects.toThrow(ConfigurationError);
    });

    test('应在项目 ID 无效时抛出错误', async () => {
      await expect(loadCredentialsFromSecretManager(
        'invalid-project',
        'binance-test-credentials'
      )).rejects.toThrow(ConfigurationError);
    });

    test('应在 secret 内容不是有效 JSON 时抛出错误', async () => {
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'invalid-json-secret'
      )).rejects.toThrow(ConfigurationError);
      
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'invalid-json-secret'
      )).rejects.toThrow('Secret value is not valid JSON');
    });

    test('应在凭据不完整时抛出错误', async () => {
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'incomplete-credentials'
      )).rejects.toThrow(ConfigurationError);
      
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'incomplete-credentials'
      )).rejects.toThrow('must contain both apiKey and apiSecret');
    });
  });

  describe('凭据缓存机制', () => {
    test('应能缓存加载的凭据', async () => {
      const cacheStats1 = getCacheStats();
      expect(cacheStats1.total).toBe(0);

      // 首次加载
      const credentials1 = await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true, // 启用缓存
        60000 // 1分钟 TTL
      );

      const cacheStats2 = getCacheStats();
      expect(cacheStats2.total).toBe(1);
      expect(cacheStats2.active).toBe(1);

      // 第二次加载应从缓存获取
      const startTime = Date.now();
      const credentials2 = await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true
      );
      const loadTime = Date.now() - startTime;

      expect(credentials2).toEqual(credentials1);
      expect(loadTime).toBeLessThan(10); // 缓存访问应该很快
    });

    test('应能禁用缓存', async () => {
      // 禁用缓存加载
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        false // 禁用缓存
      );

      const cacheStats = getCacheStats();
      expect(cacheStats.total).toBe(0);
    });

    test('应能设置自定义缓存 TTL', async () => {
      const shortTtl = 100; // 100ms

      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true,
        shortTtl
      );

      // 等待缓存过期
      await new Promise(resolve => setTimeout(resolve, 150));

      const cacheStats = getCacheStats();
      expect(cacheStats.expired).toBe(1);
      expect(cacheStats.active).toBe(0);
    });

    test('应能清理过期缓存', async () => {
      const shortTtl = 50; // 50ms

      // 加载两个不同的凭据
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true,
        shortTtl
      );
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-prod-credentials',
        true,
        shortTtl
      );

      expect(getCacheStats().total).toBe(2);

      // 等待缓存过期
      await new Promise(resolve => setTimeout(resolve, 100));

      const cleanedCount = cleanupExpiredCache();
      expect(cleanedCount).toBe(2);
      expect(getCacheStats().total).toBe(0);
    });

    test('应能清除特定 secret 的缓存', async () => {
      // 加载两个不同的凭据
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true
      );
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-prod-credentials',
        true
      );

      expect(getCacheStats().total).toBe(2);

      // 清除特定 secret 的缓存
      clearCredentialsCache('binance-test-credentials');

      const stats = getCacheStats();
      expect(stats.total).toBe(1);
      expect(stats.active).toBe(1);
    });

    test('应能清除所有缓存', async () => {
      // 加载多个凭据
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true
      );
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-prod-credentials',
        true
      );

      expect(getCacheStats().total).toBe(2);

      // 清除所有缓存
      clearCredentialsCache();

      expect(getCacheStats().total).toBe(0);
    });
  });

  describe('Secret 管理功能', () => {
    test('应能创建新的 secret', async () => {
      const credentials = {
        apiKey: 'new-test-api-key',
        apiSecret: 'new-test-api-secret'
      };

      await createOrUpdateSecret(
        testProjectId,
        'new-binance-credentials',
        credentials
      );

      // 验证创建的 secret
      const loadedCredentials = await loadCredentialsFromSecretManager(
        testProjectId,
        'new-binance-credentials'
      );

      expect(loadedCredentials.apiKey).toBe(credentials.apiKey);
      expect(loadedCredentials.apiSecret).toBe(credentials.apiSecret);
    });

    test('应能更新现有 secret', async () => {
      const newCredentials = {
        apiKey: 'updated-api-key',
        apiSecret: 'updated-api-secret'
      };

      await createOrUpdateSecret(
        testProjectId,
        'binance-test-credentials',
        newCredentials
      );

      // 验证更新的 secret
      const loadedCredentials = await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        false // 禁用缓存以获取最新值
      );

      expect(loadedCredentials.apiKey).toBe(newCredentials.apiKey);
      expect(loadedCredentials.apiSecret).toBe(newCredentials.apiSecret);
    });

    test('应能删除 secret', async () => {
      // 确保 secret 存在
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials'
      );

      // 删除 secret
      await deleteSecret(testProjectId, 'binance-test-credentials');

      // 验证 secret 已被删除
      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials'
      )).rejects.toThrow(ConfigurationError);
    });

    test('应能列出 Binance 相关的 secrets', async () => {
      const secrets = await listBinanceSecrets(testProjectId);

      expect(Array.isArray(secrets)).toBe(true);
      expect(secrets.length).toBeGreaterThan(0);
      expect(secrets).toContain('binance-test-credentials');
      expect(secrets).toContain('binance-prod-credentials');
    });

    test('应在项目不存在时抛出错误', async () => {
      await expect(createOrUpdateSecret(
        'nonexistent-project',
        'test-secret',
        { apiKey: 'test', apiSecret: 'test' }
      )).rejects.toThrow(ConfigurationError);

      await expect(deleteSecret(
        'nonexistent-project',
        'test-secret'
      )).rejects.toThrow(ConfigurationError);

      await expect(listBinanceSecrets(
        'nonexistent-project'
      )).rejects.toThrow(ConfigurationError);
    });
  });

  describe('错误处理和恢复', () => {
    test('应提供详细的错误信息', async () => {
      try {
        await loadCredentialsFromSecretManager(
          testProjectId,
          'nonexistent-secret'
        );
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.message).toContain('Failed to load secret from Secret Manager');
        expect(configError.details).toBeDefined();
        expect(configError.details.projectId).toBe(testProjectId);
        expect(configError.details.secretName).toBe('nonexistent-secret');
      }
    });

    test('应处理网络错误', async () => {
      // 模拟网络错误场景
      mockSecretStorage.setProjectId('network-error');

      try {
        await loadCredentialsFromSecretManager(
          'network-error',
          'test-secret'
        );
        fail('Expected network error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
      }

      // 恢复正常状态
      mockSecretStorage.setProjectId(testProjectId);
    });

    test('应处理权限错误', async () => {
      // 权限错误通过项目 ID 验证模拟
      try {
        await loadCredentialsFromSecretManager(
          'permission-denied',
          'test-secret'
        );
        fail('Expected permission error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
      }
    });

    test('应在缓存清理失败时继续正常运行', () => {
      // 清理不存在的缓存不应抛出错误
      expect(() => clearCredentialsCache('nonexistent-secret')).not.toThrow();
      expect(() => clearCredentialsCache()).not.toThrow();
      expect(() => cleanupExpiredCache()).not.toThrow();
    });
  });

  describe('安全性验证', () => {
    test('应验证凭据格式', async () => {
      // 添加格式不正确的凭据
      mockSecretStorage.addSecret('malformed-credentials', {
        wrongField: 'value'
      });

      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'malformed-credentials'
      )).rejects.toThrow('must contain both apiKey and apiSecret');
    });

    test('应确保凭据包含必需字段', async () => {
      // 添加只有部分字段的凭据
      mockSecretStorage.addSecret('partial-credentials', {
        apiKey: 'only-api-key'
      });

      await expect(loadCredentialsFromSecretManager(
        testProjectId,
        'partial-credentials'
      )).rejects.toThrow('must contain both apiKey and apiSecret');
    });

    test('缓存应正确隔离不同项目的凭据', async () => {
      const project1 = 'project1';
      const project2 = 'project2';

      // 设置不同项目的相同 secret 名称
      mockSecretStorage.setProjectId(project1);
      mockSecretStorage.addSecret('same-secret-name', {
        apiKey: 'project1-key',
        apiSecret: 'project1-secret'
      });

      const credentials1 = await loadCredentialsFromSecretManager(
        project1,
        'same-secret-name'
      );

      mockSecretStorage.setProjectId(project2);
      mockSecretStorage.addSecret('same-secret-name', {
        apiKey: 'project2-key',
        apiSecret: 'project2-secret'
      });

      const credentials2 = await loadCredentialsFromSecretManager(
        project2,
        'same-secret-name'
      );

      // 凭据应该不同
      expect(credentials1.apiKey).toBe('project1-key');
      expect(credentials2.apiKey).toBe('project2-key');
      expect(credentials1.apiKey).not.toBe(credentials2.apiKey);

      // 恢复测试项目
      mockSecretStorage.setProjectId(testProjectId);
    });

    test('应在缓存中保护敏感信息', async () => {
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials'
      );

      const cacheStats = getCacheStats();
      expect(cacheStats.total).toBe(1);

      // 缓存统计信息不应暴露实际的凭据内容
      expect(typeof cacheStats.total).toBe('number');
      expect(typeof cacheStats.active).toBe('number');
      expect(typeof cacheStats.expired).toBe('number');
    });
  });

  describe('性能测试', () => {
    test('凭据加载应在合理时间内完成', async () => {
      const startTime = Date.now();
      
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        false // 禁用缓存以测试实际加载时间
      );
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(200); // 应在 200ms 内完成
    });

    test('缓存访问应显著快于实际加载', async () => {
      // 首次加载（实际从 Secret Manager 加载）
      const startTime1 = Date.now();
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true
      );
      const loadTime1 = Date.now() - startTime1;

      // 第二次加载（从缓存获取）
      const startTime2 = Date.now();
      await loadCredentialsFromSecretManager(
        testProjectId,
        'binance-test-credentials',
        true
      );
      const loadTime2 = Date.now() - startTime2;

      expect(loadTime2).toBeLessThan(loadTime1 / 2); // 缓存应该至少快一半
      expect(loadTime2).toBeLessThan(50); // 缓存访问应在 50ms 内
    });

    test('应能处理并发凭据加载请求', async () => {
      const concurrentRequests = Array.from({ length: 10 }, () =>
        loadCredentialsFromSecretManager(
          testProjectId,
          'binance-test-credentials',
          true
        )
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentRequests);
      const totalTime = Date.now() - startTime;

      // 所有结果应该相同
      for (const result of results) {
        expect(result).toEqual(results[0]);
      }

      // 并发加载应该利用缓存，总时间不应显著增加
      expect(totalTime).toBeLessThan(500); // 应在 500ms 内完成所有并发请求
    });
  });
});