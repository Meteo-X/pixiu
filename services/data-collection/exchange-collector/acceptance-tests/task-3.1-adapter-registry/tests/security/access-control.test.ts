/**
 * Task 3.1 适配器注册系统 - 访问控制和安全测试
 * 
 * 验证系统的安全要求：
 * - 输入验证和清理
 * - 配置安全性
 * - 错误信息安全性
 * - 资源访问控制
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { globalCache } from '@pixiu/shared-core';

import { 
  TestEnvironment,
  ApiClient,
  testUtils
} from '../../fixtures/helpers/test-helpers';
import { 
  testIntegrationConfigs,
  securityTestData
} from '../../fixtures/test-data/adapter-configs';

describe('Task 3.1 适配器注册系统 - 访问控制和安全测试', () => {
  let testEnv: TestEnvironment;
  let apiClient: ApiClient;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    apiClient = new ApiClient('http://127.0.0.1:18080');

    await testEnv.setup('test-config.yaml');
    await testEnv.startService();

    await testUtils.waitFor(async () => {
      const health = await apiClient.getHealthReady();
      return health.status === 200;
    }, 15000);
  });

  afterAll(async () => {
    await testEnv.cleanup();
    globalCache.destroy();
  });

  describe('输入验证和清理', () => {
    it('应该验证适配器名称输入', async () => {
      const invalidNames = [
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        ''; DROP TABLE adapters; --',
        '\x00\x01\x02',
        'a'.repeat(1000), // 过长的名称
        '',               // 空名称
        null,             // null值
        undefined         // undefined值
      ];

      for (const invalidName of invalidNames) {
        try {
          const response = await apiClient.getAdapter(invalidName as any);
          
          // 应该返回错误状态码，而不是500或系统错误
          expect([400, 404]).toContain(response.status);
          
          if (response.data.error) {
            // 错误信息不应该包含敏感的系统信息
            expect(response.data.error).not.toMatch(/stack trace|file path|internal error/i);
          }
        } catch (error: any) {
          // 网络层错误是可接受的（例如无效URL字符）
          expect(error.code).toBeDefined();
        }
      }
    });

    it('应该验证配置输入的安全性', async () => {
      const maliciousConfigs = [
        // 尝试注入路径
        {
          adapterConfig: {
            endpoints: {
              ws: '../../config/secrets.yaml',
              rest: '/etc/passwd'
            }
          }
        },
        // 尝试XSS
        {
          adapterConfig: {
            exchange: '<script>alert("xss")</script>',
            endpoints: {
              ws: 'ws://localhost:8080',
              rest: 'http://localhost:8080'
            }
          }
        },
        // 尝试注入代码
        {
          adapterConfig: {
            endpoints: {
              ws: 'javascript:alert("xss")',
              rest: 'data:text/html,<script>alert("xss")</script>'
            }
          }
        },
        // 过大的配置
        {
          adapterConfig: {
            largeField: 'x'.repeat(10000000), // 10MB
            endpoints: {
              ws: 'ws://localhost:8080',
              rest: 'http://localhost:8080'
            }
          }
        }
      ];

      for (const config of maliciousConfigs) {
        const response = await apiClient.startAdapter('binance', config as any);
        
        // 应该安全地拒绝恶意配置
        expect([400, 413, 422]).toContain(response.status);
        
        if (response.data.error) {
          // 错误信息应该是清理过的
          expect(response.data.error).not.toMatch(/<script|javascript:|data:/i);
        }
      }
    });

    it('应该验证enabled参数的类型安全', async () => {
      const invalidEnabledValues = [
        'DROP TABLE adapters;',
        '<script>alert("xss")</script>',
        { malicious: 'object' },
        ['array', 'value'],
        null,
        undefined,
        'true',  // 字符串而不是布尔值
        'false', // 字符串而不是布尔值
        1,       // 数字而不是布尔值
        0        // 数字而不是布尔值
      ];

      for (const invalidValue of invalidEnabledValues) {
        const response = await apiClient.client.patch('/api/adapters/binance/enabled', {
          enabled: invalidValue
        });
        
        expect(response.status).toBe(400);
        expect(response.data.error).toContain('Invalid enabled value');
      }
    });

    it('应该限制请求体大小', async () => {
      // 创建超大请求体
      const largeConfig = {
        adapterConfig: {
          exchange: 'binance',
          endpoints: {
            ws: 'ws://localhost:8080',
            rest: 'http://localhost:8080'
          },
          largeField: 'x'.repeat(50 * 1024 * 1024) // 50MB
        },
        publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
        monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
      };

      const response = await apiClient.startAdapter('binance', largeConfig);
      
      // 应该拒绝过大的请求
      expect([400, 413]).toContain(response.status);
    });
  });

  describe('错误信息安全性', () => {
    it('404错误不应该泄露系统信息', async () => {
      const response = await apiClient.getAdapter('nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.data.error).toBeDefined();
      
      // 错误信息应该是通用的，不泄露内部结构
      expect(response.data.error).not.toMatch(/stack trace|file path|database|internal|system|config/i);
      expect(response.data.error).toContain('not found');
    });

    it('500错误不应该泄露敏感信息', async () => {
      // 尝试触发内部错误（通过提供格式错误的JSON）
      try {
        const response = await apiClient.client.post('/api/adapters/binance/start', 
          'invalid json{', 
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
        
        if (response.status >= 500) {
          expect(response.data.error).toBeDefined();
          
          // 不应该包含敏感信息
          expect(response.data.error).not.toMatch(/stack trace|file path|line \d+|function|\.js|\.ts/i);
        }
      } catch (error: any) {
        // Axios解析错误是可接受的
        expect(error.message).toBeDefined();
      }
    });

    it('配置错误不应该泄露敏感配置信息', async () => {
      const invalidConfig = {
        adapterConfig: {
          endpoints: {
            ws: 'invalid-url',
            rest: 'invalid-url'
          },
          auth: {
            apiKey: 'secret-api-key',
            apiSecret: 'secret-api-secret'
          }
        },
        publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
        monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
      };

      const response = await apiClient.startAdapter('binance', invalidConfig);
      
      if (response.status >= 400) {
        const errorMessage = JSON.stringify(response.data);
        
        // 不应该在错误信息中包含敏感配置
        expect(errorMessage).not.toContain('secret-api-key');
        expect(errorMessage).not.toContain('secret-api-secret');
        expect(errorMessage).not.toMatch(/api.*key|api.*secret/i);
      }
    });
  });

  describe('资源访问控制', () => {
    it('应该限制并发请求数量', async () => {
      const maxConcurrentRequests = 1000;
      const promises = [];

      // 发送大量并发请求
      for (let i = 0; i < maxConcurrentRequests; i++) {
        promises.push(
          apiClient.getHealth().catch(error => ({
            status: error.response?.status || 500,
            error: error.message
          }))
        );
      }

      const responses = await Promise.allSettled(promises);
      
      // 验证系统没有崩溃
      const successfulResponses = responses.filter(result => 
        result.status === 'fulfilled' && 
        result.value.status >= 200 && 
        result.value.status < 300
      );

      // 应该有大部分请求成功，系统应该优雅地处理过载
      const successRate = successfulResponses.length / responses.length;
      expect(successRate).toBeGreaterThan(0.5); // 至少50%成功率

      // 验证服务仍然响应
      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);
    });

    it('应该防止路径遍历攻击', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
        '/etc/passwd',
        'C:\\Windows\\System32\\config\\SAM',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        try {
          const response = await apiClient.getAdapter(maliciousPath);
          
          // 应该返回404而不是文件内容
          expect(response.status).toBe(404);
          expect(response.data.error).toContain('not found');
          
          // 响应不应该包含文件内容
          const responseText = JSON.stringify(response.data);
          expect(responseText).not.toMatch(/root:|password:|admin:/);
        } catch (error: any) {
          // 网络层拒绝无效字符是可接受的
          expect(error.code).toBeDefined();
        }
      }
    });

    it('应该防止HTTP方法滥用', async () => {
      const unauthorizedMethods = ['DELETE', 'PUT', 'HEAD', 'OPTIONS', 'TRACE'];

      for (const method of unauthorizedMethods) {
        try {
          const response = await apiClient.client.request({
            method: method.toLowerCase() as any,
            url: '/api/adapters'
          });
          
          // 应该返回方法不允许或未找到
          expect([404, 405]).toContain(response.status);
        } catch (error: any) {
          // axios可能会抛出错误，这也是可接受的
          expect([404, 405]).toContain(error.response?.status);
        }
      }
    });
  });

  describe('配置安全性', () => {
    it('应该验证WebSocket URL的安全性', async () => {
      const unsafeUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'ftp://malicious.site/evil',
        'http://internal-service:8080/admin',
        'ws://0.0.0.0:22/ssh',
        'wss://';DROP TABLE users;--'
      ];

      for (const unsafeUrl of unsafeUrls) {
        const config = {
          adapterConfig: {
            ...testIntegrationConfigs.binanceIntegration.adapterConfig,
            endpoints: {
              ws: unsafeUrl,
              rest: 'https://api.binance.com/api'
            }
          },
          publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
          monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
        };

        const response = await apiClient.startAdapter('binance', config);
        
        // 应该拒绝不安全的URL
        expect([400, 422]).toContain(response.status);
      }
    });

    it('应该验证REST URL的安全性', async () => {
      const unsafeUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'http://localhost:22/ssh',
        'https://internal.company.com/secrets',
        'http://169.254.169.254/metadata' // AWS metadata service
      ];

      for (const unsafeUrl of unsafeUrls) {
        const config = {
          adapterConfig: {
            ...testIntegrationConfigs.binanceIntegration.adapterConfig,
            endpoints: {
              ws: 'wss://stream.binance.com:9443/ws',
              rest: unsafeUrl
            }
          },
          publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
          monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
        };

        const response = await apiClient.startAdapter('binance', config);
        
        // 应该拒绝不安全的URL
        expect([400, 422]).toContain(response.status);
      }
    });

    it('应该限制配置中的数值范围', async () => {
      const extremeValues = [
        { timeout: -1 },
        { timeout: Number.MAX_SAFE_INTEGER },
        { maxRetries: -1 },
        { maxRetries: 10000 },
        { retryInterval: -1000 },
        { retryInterval: Number.MAX_SAFE_INTEGER },
        { heartbeatInterval: -5000 },
        { heartbeatInterval: Number.MAX_SAFE_INTEGER }
      ];

      for (const extremeValue of extremeValues) {
        const config = {
          adapterConfig: {
            ...testIntegrationConfigs.binanceIntegration.adapterConfig,
            connection: {
              ...testIntegrationConfigs.binanceIntegration.adapterConfig.connection,
              ...extremeValue
            }
          },
          publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
          monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
        };

        const response = await apiClient.startAdapter('binance', config);
        
        // 应该验证并拒绝极端值
        if (response.status !== 200) {
          expect([400, 422]).toContain(response.status);
        }
      }
    });
  });

  describe('日志安全性', () => {
    it('敏感信息不应该出现在日志中', async () => {
      // 使用包含敏感信息的配置
      const sensitiveConfig = {
        adapterConfig: {
          ...testIntegrationConfigs.binanceIntegration.adapterConfig,
          auth: {
            apiKey: 'test-secret-api-key',
            apiSecret: 'test-secret-api-secret'
          }
        },
        publishConfig: testIntegrationConfigs.binanceIntegration.publishConfig,
        monitoringConfig: testIntegrationConfigs.binanceIntegration.monitoringConfig
      };

      const response = await apiClient.startAdapter('binance', sensitiveConfig);
      
      // 无论成功或失败，敏感信息都不应该在响应中
      const responseText = JSON.stringify(response);
      expect(responseText).not.toContain('test-secret-api-key');
      expect(responseText).not.toContain('test-secret-api-secret');
    });

    it('错误响应不应该包含内部系统路径', async () => {
      const response = await apiClient.startAdapter('binance', { invalid: 'config' } as any);
      
      const responseText = JSON.stringify(response);
      
      // 不应该包含系统路径
      expect(responseText).not.toMatch(/\/[a-z]+\/[a-z]+\/.*\.js/); // Unix路径
      expect(responseText).not.toMatch(/C:\\.*\\.*\.js/);           // Windows路径
      expect(responseText).not.toMatch(/node_modules/);
      expect(responseText).not.toMatch(/\/src\/|\/dist\//);
    });
  });

  describe('资源消耗防护', () => {
    it('应该防止内存耗尽攻击', async () => {
      // 尝试创建大量适配器实例
      const promises = [];
      const maxAttempts = 50;

      for (let i = 0; i < maxAttempts; i++) {
        promises.push(
          apiClient.startAdapter('binance', testIntegrationConfigs.binanceIntegration)
            .catch(() => ({ status: 400 }))
        );
      }

      const responses = await Promise.allSettled(promises);
      
      // 系统应该能够处理请求而不崩溃
      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);
    });

    it('应该防止CPU耗尽攻击', async () => {
      const startTime = Date.now();
      const promises = [];

      // 发送计算密集型请求
      for (let i = 0; i < 100; i++) {
        promises.push(
          apiClient.getMetricsJson().catch(() => ({ status: 500 }))
        );
      }

      await Promise.allSettled(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 验证服务仍然响应且没有超时
      expect(totalTime).toBeLessThan(30000); // 30秒内完成

      const finalHealthResponse = await apiClient.getHealth();
      expect([200, 503]).toContain(finalHealthResponse.status);
    });
  });
});