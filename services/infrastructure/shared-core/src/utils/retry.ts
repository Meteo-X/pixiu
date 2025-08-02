/**
 * 重试机制工具
 */

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟时间（毫秒） */
  initialDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 退避算法 */
  backoffStrategy: 'fixed' | 'linear' | 'exponential' | 'custom';
  /** 自定义退避函数 */
  customBackoff?: (attempt: number, delay: number) => number;
  /** 重试条件判断函数 */
  shouldRetry?: (error: Error) => boolean;
  /** 抖动因子（0-1） */
  jitterFactor?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
}

export interface RetryResult<T> {
  /** 执行结果 */
  result?: T;
  /** 是否成功 */
  success: boolean;
  /** 执行次数 */
  attempts: number;
  /** 总耗时 */
  totalTime: number;
  /** 最后的错误 */
  lastError?: Error;
  /** 所有错误 */
  errors: Error[];
}

/**
 * 重试执行器
 */
export class RetryExecutor {
  private defaultOptions: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffStrategy: 'exponential',
    jitterFactor: 0.1,
    shouldRetry: () => true
  };

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.defaultOptions, ...options };
    const result: RetryResult<T> = {
      success: false,
      attempts: 0,
      totalTime: 0,
      errors: []
    };

    const startTime = Date.now();
    let delay = config.initialDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      result.attempts++;

      try {
        // 设置超时
        let operationPromise: Promise<T>;
        if (config.timeout) {
          operationPromise = Promise.race([
            operation(),
            this.timeout<T>(config.timeout, `Operation timed out after ${config.timeout}ms`)
          ]);
        } else {
          operationPromise = operation();
        }

        result.result = await operationPromise;
        result.success = true;
        break;
      } catch (error) {
        const err = error as Error;
        result.errors.push(err);
        result.lastError = err;

        // 检查是否应该重试
        if (attempt >= config.maxRetries || !config.shouldRetry!(err)) {
          break;
        }

        // 计算下次重试的延迟时间
        delay = this.calculateDelay(attempt + 1, delay, config);

        // 等待重试
        await this.delay(delay);
      }
    }

    result.totalTime = Date.now() - startTime;
    return result;
  }

  /**
   * 简化的重试函数
   */
  async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    const result = await this.execute(operation, {
      maxRetries,
      initialDelay: delay,
      backoffStrategy: 'fixed'
    });

    if (!result.success) {
      throw result.lastError || new Error('Operation failed after retries');
    }

    return result.result!;
  }

  /**
   * 带指数退避的重试
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    const result = await this.execute(operation, {
      maxRetries,
      initialDelay,
      backoffStrategy: 'exponential'
    });

    if (!result.success) {
      throw result.lastError || new Error('Operation failed after retries');
    }

    return result.result!;
  }

  /**
   * 计算延迟时间
   */
  private calculateDelay(attempt: number, currentDelay: number, config: RetryOptions): number {
    let nextDelay: number;

    switch (config.backoffStrategy) {
      case 'fixed':
        nextDelay = config.initialDelay;
        break;
      
      case 'linear':
        nextDelay = config.initialDelay * attempt;
        break;
      
      case 'exponential':
        nextDelay = config.initialDelay * Math.pow(2, attempt - 1);
        break;
      
      case 'custom':
        if (config.customBackoff) {
          nextDelay = config.customBackoff(attempt, currentDelay);
        } else {
          nextDelay = currentDelay;
        }
        break;
      
      default:
        nextDelay = currentDelay;
    }

    // 限制最大延迟
    nextDelay = Math.min(nextDelay, config.maxDelay);

    // 添加抖动
    if (config.jitterFactor && config.jitterFactor > 0) {
      const jitter = nextDelay * config.jitterFactor * Math.random();
      nextDelay += jitter;
    }

    return Math.floor(nextDelay);
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 超时工具函数
   */
  private timeout<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}

/**
 * 创建重试装饰器
 */
export function retryable(options: Partial<RetryOptions> = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const executor = new RetryExecutor();

    descriptor.value = async function (...args: any[]) {
      const result = await executor.execute(
        () => originalMethod.apply(this, args),
        options
      );

      if (!result.success) {
        throw result.lastError || new Error('Method execution failed after retries');
      }

      return result.result;
    };

    return descriptor;
  };
}

/**
 * 全局重试执行器实例
 */
export const retry = new RetryExecutor();