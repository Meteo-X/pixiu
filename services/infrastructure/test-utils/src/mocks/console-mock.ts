/**
 * 控制台输出Mock工具
 * 用于减少测试时的噪音输出
 */

interface ConsoleMockConfig {
  suppressWarnings?: boolean;
  suppressErrors?: boolean;
  suppressLogs?: boolean;
  suppressInfo?: boolean;
  allowedMessages?: string[];
  blockedMessages?: string[];
}

/**
 * 控制台Mock管理器
 */
export class ConsoleMock {
  private originalMethods: {
    error: typeof console.error;
    warn: typeof console.warn;
    log: typeof console.log;
    info: typeof console.info;
  };
  
  private config: ConsoleMockConfig;
  private isActive = false;

  constructor(config: ConsoleMockConfig = {}) {
    this.originalMethods = {
      error: console.error,
      warn: console.warn,
      log: console.log,
      info: console.info
    };
    
    this.config = {
      suppressWarnings: true,
      suppressErrors: false,
      suppressLogs: false,
      suppressInfo: false,
      allowedMessages: [],
      blockedMessages: ['Warning:', 'deprecated'],
      ...config
    };
  }

  /**
   * 检查消息是否应该被过滤
   */
  private shouldFilterMessage(message: string): boolean {
    const { allowedMessages = [], blockedMessages = [] } = this.config;
    
    // 如果有允许列表，只允许匹配的消息
    if (allowedMessages.length > 0) {
      return !allowedMessages.some(allowed => message.includes(allowed));
    }
    
    // 检查阻止列表
    return blockedMessages.some(blocked => message.includes(blocked));
  }

  /**
   * 创建过滤后的控制台方法
   */
  private createFilteredMethod(originalMethod: Function, suppress: boolean = false) {
    return (...args: any[]) => {
      if (suppress) return;
      
      const message = args[0]?.toString() || '';
      if (this.shouldFilterMessage(message)) return;
      
      originalMethod.apply(console, args);
    };
  }

  /**
   * 启用控制台Mock
   */
  enable(): void {
    if (this.isActive) return;

    console.error = this.createFilteredMethod(this.originalMethods.error, this.config.suppressErrors);
    console.warn = this.createFilteredMethod(this.originalMethods.warn, this.config.suppressWarnings);
    console.log = this.createFilteredMethod(this.originalMethods.log, this.config.suppressLogs);
    console.info = this.createFilteredMethod(this.originalMethods.info, this.config.suppressInfo);

    this.isActive = true;
  }

  /**
   * 禁用控制台Mock，恢复原始方法
   */
  disable(): void {
    if (!this.isActive) return;

    console.error = this.originalMethods.error;
    console.warn = this.originalMethods.warn;
    console.log = this.originalMethods.log;
    console.info = this.originalMethods.info;

    this.isActive = false;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ConsoleMockConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.isActive) {
      this.disable();
      this.enable();
    }
  }

  /**
   * 临时启用控制台Mock执行函数
   */
  withSuppressed<T>(fn: () => T): T {
    this.enable();
    try {
      return fn();
    } finally {
      this.disable();
    }
  }
}

/**
 * 创建控制台Mock实例
 */
export function createConsoleMock(config?: ConsoleMockConfig): ConsoleMock {
  return new ConsoleMock(config);
}

/**
 * 预定义的控制台Mock配置
 */
export const CONSOLE_MOCK_CONFIGS = {
  /** 安静模式 - 抑制大部分输出 */
  QUIET: {
    suppressWarnings: true,
    suppressErrors: false,
    suppressLogs: true,
    suppressInfo: true,
    blockedMessages: ['Warning:', 'deprecated', 'Debug:']
  } as ConsoleMockConfig,
  
  /** 仅错误模式 - 只显示错误 */
  ERRORS_ONLY: {
    suppressWarnings: true,
    suppressErrors: false,
    suppressLogs: true,
    suppressInfo: true
  } as ConsoleMockConfig,
  
  /** 完全静默模式 */
  SILENT: {
    suppressWarnings: true,
    suppressErrors: true,
    suppressLogs: true,
    suppressInfo: true
  } as ConsoleMockConfig
} as const;