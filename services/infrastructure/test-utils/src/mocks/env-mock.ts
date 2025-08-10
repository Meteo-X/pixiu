/**
 * 环境变量Mock工具
 * 提供测试环境变量管理
 */

interface TestEnvConfig {
  NODE_ENV?: string;
  LOG_LEVEL?: string;
  PUBSUB_EMULATOR_HOST?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  [key: string]: string | undefined;
}

/**
 * 默认测试环境变量
 */
export const DEFAULT_TEST_ENV: TestEnvConfig = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  PUBSUB_EMULATOR_HOST: 'localhost:8085',
  GOOGLE_CLOUD_PROJECT: 'test-project'
};

/**
 * 环境变量Mock管理器
 */
export class EnvMock {
  private originalEnv: Record<string, string | undefined> = {};
  private isActive = false;

  /**
   * 设置测试环境变量
   */
  setup(config: TestEnvConfig = DEFAULT_TEST_ENV): void {
    if (this.isActive) {
      this.restore();
    }

    // 保存原始环境变量
    Object.keys(config).forEach(key => {
      this.originalEnv[key] = process.env[key];
      process.env[key] = config[key];
    });

    this.isActive = true;
  }

  /**
   * 设置单个环境变量
   */
  set(key: string, value: string): void {
    if (!this.isActive) {
      this.originalEnv[key] = process.env[key];
    }
    process.env[key] = value;
  }

  /**
   * 获取环境变量
   */
  get(key: string): string | undefined {
    return process.env[key];
  }

  /**
   * 恢复原始环境变量
   */
  restore(): void {
    if (!this.isActive) return;

    Object.keys(this.originalEnv).forEach(key => {
      if (this.originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = this.originalEnv[key];
      }
    });

    this.originalEnv = {};
    this.isActive = false;
  }

  /**
   * 临时设置环境变量执行函数
   */
  withEnv<T>(config: TestEnvConfig, fn: () => T): T {
    this.setup(config);
    try {
      return fn();
    } finally {
      this.restore();
    }
  }
}

/**
 * 创建环境变量Mock实例
 */
export function createEnvMock(): EnvMock {
  return new EnvMock();
}

/**
 * 全局环境变量Mock实例
 */
export const envMock = createEnvMock();