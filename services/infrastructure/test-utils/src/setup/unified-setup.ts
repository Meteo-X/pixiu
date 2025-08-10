/**
 * 统一测试设置工具
 * 提供一键式的测试环境配置
 */

import { mockPubSub } from '../mocks/pubsub-mock';
import { mockWebSocket } from '../mocks/websocket-mock';
import { envMock, DEFAULT_TEST_ENV } from '../mocks/env-mock';
import { createConsoleMock, CONSOLE_MOCK_CONFIGS } from '../mocks/console-mock';

export interface UnifiedSetupConfig {
  /** 测试超时时间（毫秒） */
  timeout?: number;
  
  /** 环境变量配置 */
  env?: Record<string, string>;
  
  /** 是否启用PubSub Mock */
  enablePubSubMock?: boolean;
  
  /** 是否启用WebSocket Mock */
  enableWebSocketMock?: boolean;
  
  /** 控制台输出配置 */
  console?: 'quiet' | 'errors-only' | 'silent' | 'normal';
  
  /** 是否启用全局缓存清理 */
  enableGlobalCacheCleanup?: boolean;
  
  /** 自定义清理函数 */
  customCleanup?: () => void;
}

const DEFAULT_CONFIG: Required<UnifiedSetupConfig> = {
  timeout: 10000,
  env: DEFAULT_TEST_ENV as Record<string, string>,
  enablePubSubMock: true,
  enableWebSocketMock: true,
  console: 'quiet',
  enableGlobalCacheCleanup: true,
  customCleanup: () => {}
};

/**
 * 统一测试设置类
 */
export class UnifiedTestSetup {
  private config: Required<UnifiedSetupConfig>;
  private consoleMock;
  private isSetup = false;

  constructor(config: UnifiedSetupConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 创建控制台Mock
    const consoleConfig = this.config.console === 'normal' 
      ? undefined 
      : CONSOLE_MOCK_CONFIGS[this.config.console.toUpperCase() as keyof typeof CONSOLE_MOCK_CONFIGS];
      
    this.consoleMock = createConsoleMock(consoleConfig);
  }

  /**
   * 执行测试设置
   */
  setup(): void {
    if (this.isSetup) return;

    // 设置Jest超时
    if (typeof jest !== 'undefined' && jest.setTimeout) {
      jest.setTimeout(this.config.timeout);
    }

    // 设置环境变量
    envMock.setup(this.config.env);

    // 启用Mocks
    if (this.config.enablePubSubMock) {
      mockPubSub();
    }

    if (this.config.enableWebSocketMock) {
      mockWebSocket();
    }

    // 启用控制台过滤
    if (this.config.console !== 'normal') {
      this.consoleMock.enable();
    }

    this.isSetup = true;
  }

  /**
   * 执行测试清理
   */
  cleanup(): void {
    if (!this.isSetup) return;

    // 恢复环境变量
    envMock.restore();

    // 禁用控制台Mock
    this.consoleMock.disable();

    // 全局缓存清理
    if (this.config.enableGlobalCacheCleanup) {
      this.cleanupGlobalCache();
    }

    // 执行自定义清理
    this.config.customCleanup();

    this.isSetup = false;
  }

  /**
   * 清理全局缓存
   */
  private cleanupGlobalCache(): void {
    try {
      // 尝试清理shared-core的globalCache
      const { globalCache } = require('@pixiu/shared-core');
      if (globalCache && typeof globalCache.destroy === 'function') {
        globalCache.destroy();
      }
    } catch (error) {
      // 如果shared-core不可用，忽略错误
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<UnifiedSetupConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<UnifiedSetupConfig>): void {
    const wasSetup = this.isSetup;
    
    if (wasSetup) {
      this.cleanup();
    }
    
    this.config = { ...this.config, ...newConfig };
    
    if (wasSetup) {
      this.setup();
    }
  }
}

/**
 * 创建统一测试设置实例
 */
export function createUnifiedSetup(config?: UnifiedSetupConfig): UnifiedTestSetup {
  return new UnifiedTestSetup(config);
}

/**
 * 全局测试设置实例
 */
export const globalTestSetup = createUnifiedSetup();

/**
 * 快捷设置函数
 */
export function setupTests(config?: UnifiedSetupConfig): void {
  const setup = createUnifiedSetup(config);
  setup.setup();
  
  // 注册全局清理
  if (typeof afterAll !== 'undefined') {
    afterAll(() => {
      setup.cleanup();
    });
  }
}

/**
 * 预定义的设置配置
 */
export const SETUP_CONFIGS = {
  /** 基础设置 - 适用于大部分测试 */
  BASIC: {
    console: 'quiet',
    enablePubSubMock: true,
    enableWebSocketMock: true
  } as UnifiedSetupConfig,
  
  /** 静默设置 - 完全静默的测试环境 */
  SILENT: {
    console: 'silent',
    enablePubSubMock: true,
    enableWebSocketMock: true
  } as UnifiedSetupConfig,
  
  /** 最小设置 - 只设置环境变量 */
  MINIMAL: {
    console: 'normal',
    enablePubSubMock: false,
    enableWebSocketMock: false
  } as UnifiedSetupConfig
} as const;