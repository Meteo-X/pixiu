/**
 * Shared Core配置管理器单元测试
 */

import { BaseConfigManager, ConfigSource, globalCache } from '../src';

// 创建测试用的配置管理器
class TestConfigManager extends BaseConfigManager {
  protected getDefaultSources(): ConfigSource[] {
    return [
      { type: 'default', source: 'default', priority: 1 },
      { type: 'env', source: 'TEST', priority: 2 }
    ];
  }

  protected getDefaultConfig() {
    return {
      name: 'test-service',
      version: '1.0.0',
      debug: false
    };
  }
}

describe('BaseConfigManager', () => {
  let configManager: TestConfigManager;

  beforeEach(() => {
    configManager = new TestConfigManager();
  });

  afterEach(() => {
    // 清理环境变量
    delete process.env.TEST_DEBUG;
    delete process.env.TEST_NAME;
  });

  describe('配置加载', () => {
    it('应该能够加载默认配置', async () => {
      const result = await configManager.load();
      
      expect(result.hasValidationErrors).toBe(false);
      expect(result.config).toMatchObject({
        name: 'test-service',
        version: '1.0.0',
        debug: false
      });
    });

    it('应该能够通过环境变量覆盖配置', async () => {
      process.env.TEST_DEBUG = 'true';
      process.env.TEST_NAME = 'overridden-service';
      
      const result = await configManager.load();
      
      expect((result.config as any).debug).toBe(true);
      expect((result.config as any).name).toBe('overridden-service');
    });

    it('应该返回配置加载的来源信息', async () => {
      const result = await configManager.load();
      
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.some(s => s.type === 'default')).toBe(true);
    });
  });

  describe('配置验证', () => {
    it('应该能够添加自定义验证器', async () => {
      configManager.addValidator((config) => {
        if (!config.name) {
          return 'Name is required';
        }
        return true;
      });

      const result = await configManager.load();
      expect(result.hasValidationErrors).toBe(false);
    });

    it('应该捕获验证错误', async () => {
      configManager.addValidator(() => 'Validation failed');

      const result = await configManager.load();
      expect(result.hasValidationErrors).toBe(true);
      expect(result.validationErrors).toContain('Validation failed');
    });
  });

  describe('配置访问', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('应该能够获取完整配置', () => {
      const config = configManager.getConfig();
      expect(config).toMatchObject({
        name: 'test-service',
        version: '1.0.0'
      });
    });

    it('应该能够获取特定配置项', () => {
      const name = configManager.get('name');
      expect(name).toBe('test-service');
    });

    it('应该验证配置是否有效', () => {
      expect(configManager.isValid()).toBe(true);
    });
  });

  describe('配置转换', () => {
    it('应该能够添加配置转换器', async () => {
      configManager.addTransformer((config) => ({
        ...config,
        transformed: true
      }));

      const result = await configManager.load();
      expect((result.config as any).transformed).toBe(true);
    });
  });

  describe('事件处理', () => {
    it('应该在配置加载时发出事件', async () => {
      const eventHandler = jest.fn();
      configManager.onConfigUpdate(eventHandler);

      await configManager.load();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'loaded',
          config: expect.any(Object)
        })
      );
    });

    it('应该在验证失败时发出事件', async () => {
      const eventHandler = jest.fn();
      configManager.onConfigUpdate(eventHandler);
      configManager.addValidator(() => 'Validation error');

      await configManager.load();

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation_failed'
        })
      );
    });
  });
});

// 清理全局资源
afterAll(() => {
  globalCache.destroy();
});