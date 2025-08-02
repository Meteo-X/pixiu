/**
 * Test configurations for pipeline testing
 */

import {
  PipelineConfig,
  StageConfig,
  ErrorHandlingConfig,
  MonitoringConfig,
  PerformanceConfig
} from '../../src/pipeline/core/data-pipeline';

import {
  BufferStageConfig
} from '../../src/pipeline/stages/buffer-stage';

import {
  RouterStageConfig,
  RoutingRule
} from '../../src/pipeline/stages/router-stage';

/**
 * 基础管道配置
 */
export function createBasePipelineConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    id: 'test-pipeline',
    name: 'Test Data Pipeline',
    stages: [
      {
        enabled: true,
        name: 'input',
        parallel: false,
        timeout: 5000,
        retryCount: 0,
        retryInterval: 1000
      }
    ],
    errorHandling: createErrorHandlingConfig(),
    monitoring: createMonitoringConfig(),
    performance: createPerformanceConfig(),
    ...overrides
  };
}

/**
 * 错误处理配置
 */
export function createErrorHandlingConfig(overrides: Partial<ErrorHandlingConfig> = {}): ErrorHandlingConfig {
  return {
    strategy: 'CONTINUE',
    maxRetries: 3,
    retryInterval: 1000,
    ...overrides
  };
}

/**
 * 监控配置
 */
export function createMonitoringConfig(overrides: Partial<MonitoringConfig> = {}): MonitoringConfig {
  return {
    enableMetrics: true,
    enableTracing: false,
    metricsInterval: 1000,
    healthCheckInterval: 5000,
    alertThresholds: {
      errorRate: 0.05,
      latency: 1000,
      throughput: 100,
      memoryUsage: 0.8
    },
    ...overrides
  };
}

/**
 * 性能配置
 */
export function createPerformanceConfig(overrides: Partial<PerformanceConfig> = {}): PerformanceConfig {
  return {
    maxConcurrency: 10,
    queueSize: 100,
    backpressureStrategy: 'BLOCK',
    memoryLimit: 50 * 1024 * 1024, // 50MB
    gcThreshold: 0.8,
    ...overrides
  };
}

/**
 * 缓冲阶段配置
 */
export function createBufferStageConfig(overrides: Partial<BufferStageConfig> = {}): BufferStageConfig {
  return {
    enabled: true,
    name: 'buffer',
    parallel: false,
    timeout: 10000,
    retryCount: 1,
    retryInterval: 1000,
    bufferPolicy: {
      maxSize: 100,
      maxAge: 5000,
      flushInterval: 1000,
      backpressureThreshold: 0.8
    },
    partitionBy: 'symbol',
    enableBackpressure: true,
    backpressureStrategy: 'BLOCK',
    enableCompression: false,
    ...overrides
  };
}

/**
 * 路由阶段配置
 */
export function createRouterStageConfig(overrides: Partial<RouterStageConfig> = {}): RouterStageConfig {
  return {
    enabled: true,
    name: 'router',
    parallel: false,
    timeout: 2000,
    retryCount: 1,
    retryInterval: 500,
    rules: createDefaultRoutingRules(),
    enableFallback: true,
    routingStrategy: 'first_match',
    enableCaching: true,
    enableDuplication: false,
    cacheSize: 100,
    cacheTtl: 10000,
    ...overrides
  };
}

/**
 * 默认路由规则
 */
export function createDefaultRoutingRules(): RoutingRule[] {
  return [
    {
      id: 'binance-ticker',
      name: 'Binance Ticker Route',
      enabled: true,
      priority: 100,
      condition: {
        type: 'exact',
        field: 'exchange',
        value: 'binance'
      },
      target: {
        type: 'topic',
        destination: 'binance-ticker-data'
      }
    },
    {
      id: 'btc-data',
      name: 'Bitcoin Data Route',
      enabled: true,
      priority: 90,
      condition: {
        type: 'pattern',
        field: 'symbol',
        value: 'BTC.*'
      },
      target: {
        type: 'topic',
        destination: 'btc-market-data'
      }
    },
    {
      id: 'high-volume',
      name: 'High Volume Route',
      enabled: true,
      priority: 80,
      condition: {
        type: 'function',
        field: 'custom',
        function: (data) => {
          return data.data?.volume && data.data.volume > 10;
        }
      },
      target: {
        type: 'topic',
        destination: 'high-volume-data'
      }
    }
  ];
}

/**
 * 复合路由规则
 */
export function createCompositeRoutingRules(): RoutingRule[] {
  return [
    {
      id: 'binance-btc-ticker',
      name: 'Binance BTC Ticker',
      enabled: true,
      priority: 100,
      condition: {
        type: 'composite',
        operator: 'AND',
        conditions: [
          {
            type: 'exact',
            field: 'exchange',
            value: 'binance'
          },
          {
            type: 'pattern',
            field: 'symbol',
            value: 'BTC.*'
          },
          {
            type: 'exact',
            field: 'dataType',
            value: 'ticker'
          }
        ]
      },
      target: {
        type: 'topic',
        destination: 'binance-btc-ticker'
      }
    }
  ];
}

/**
 * 多目标路由规则
 */
export function createMultiTargetRoutingRules(): RoutingRule[] {
  return [
    {
      id: 'broadcast-btc',
      name: 'Broadcast BTC Data',
      enabled: true,
      priority: 100,
      condition: {
        type: 'pattern',
        field: 'symbol',
        value: 'BTC.*'
      },
      target: {
        type: 'topic',
        destination: ['btc-primary', 'btc-analytics', 'btc-alerts']
      }
    }
  ];
}

/**
 * 性能测试配置
 */
export function createPerformanceTestConfig(): PipelineConfig {
  return createBasePipelineConfig({
    id: 'performance-test-pipeline',
    name: 'Performance Test Pipeline',
    stages: [
      {
        enabled: true,
        name: 'input',
        parallel: false,
        timeout: 1000,
        retryCount: 0,
        retryInterval: 100
      },
      {
        enabled: true,
        name: 'buffer',
        parallel: false,
        timeout: 2000,
        retryCount: 0,
        retryInterval: 100
      }
    ],
    performance: {
      maxConcurrency: 100,
      queueSize: 10000,
      backpressureStrategy: 'DROP',
      memoryLimit: 200 * 1024 * 1024, // 200MB
      gcThreshold: 0.9
    },
    monitoring: {
      enableMetrics: true,
      enableTracing: true,
      metricsInterval: 500,
      healthCheckInterval: 1000,
      alertThresholds: {
        errorRate: 0.01,
        latency: 100,
        throughput: 1000,
        memoryUsage: 0.9
      }
    }
  });
}

/**
 * 高频率数据处理配置
 */
export function createHighFrequencyConfig(): BufferStageConfig {
  return createBufferStageConfig({
    bufferPolicy: {
      maxSize: 1000,
      maxAge: 1000, // 1秒
      flushInterval: 500, // 500ms
      backpressureThreshold: 0.9
    },
    partitionBy: 'symbol',
    enableBackpressure: true,
    backpressureStrategy: 'DROP',
    enableCompression: true,
    compressionAlgorithm: 'gzip'
  });
}

/**
 * 内存优化配置
 */
export function createMemoryOptimizedConfig(): PipelineConfig {
  return createBasePipelineConfig({
    id: 'memory-optimized-pipeline',
    name: 'Memory Optimized Pipeline',
    performance: {
      maxConcurrency: 20,
      queueSize: 500,
      backpressureStrategy: 'SPILL',
      memoryLimit: 50 * 1024 * 1024, // 50MB
      gcThreshold: 0.7
    },
    monitoring: {
      enableMetrics: true,
      enableTracing: false,
      metricsInterval: 2000,
      healthCheckInterval: 5000,
      alertThresholds: {
        errorRate: 0.05,
        latency: 500,
        throughput: 200,
        memoryUsage: 0.7
      }
    }
  });
}

/**
 * 错误恢复测试配置
 */
export function createErrorRecoveryConfig(): PipelineConfig {
  return createBasePipelineConfig({
    id: 'error-recovery-pipeline',
    name: 'Error Recovery Test Pipeline',
    errorHandling: {
      strategy: 'RETRY',
      maxRetries: 5,
      retryInterval: 500
    },
    stages: [
      {
        enabled: true,
        name: 'input',
        parallel: false,
        timeout: 1000,
        retryCount: 3,
        retryInterval: 200,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          timeoutThreshold: 1000,
          resetTimeout: 5000
        }
      }
    ]
  });
}

/**
 * 配置工厂类
 */
export class TestConfigFactory {
  /**
   * 创建最小配置
   */
  static createMinimal(): PipelineConfig {
    return {
      id: 'minimal-pipeline',
      name: 'Minimal Pipeline',
      stages: [],
      errorHandling: {
        strategy: 'FAIL_FAST',
        maxRetries: 0,
        retryInterval: 0
      },
      monitoring: {
        enableMetrics: false,
        enableTracing: false,
        metricsInterval: 10000,
        healthCheckInterval: 30000,
        alertThresholds: {
          errorRate: 1.0,
          latency: 10000,
          throughput: 1,
          memoryUsage: 1.0
        }
      },
      performance: {
        maxConcurrency: 1,
        queueSize: 1,
        backpressureStrategy: 'BLOCK',
        memoryLimit: 10 * 1024 * 1024,
        gcThreshold: 0.9
      }
    };
  }
  
  /**
   * 创建完整配置
   */
  static createComplete(): PipelineConfig {
    return createBasePipelineConfig({
      stages: [
        {
          enabled: true,
          name: 'input',
          parallel: false,
          timeout: 5000,
          retryCount: 0,
          retryInterval: 1000
        },
        {
          enabled: true,
          name: 'validation',
          parallel: false,
          timeout: 1000,
          retryCount: 3,
          retryInterval: 500
        },
        {
          enabled: true,
          name: 'transformation',
          parallel: false,
          timeout: 1000,
          retryCount: 3,
          retryInterval: 500
        },
        {
          enabled: true,
          name: 'routing',
          parallel: false,
          timeout: 2000,
          retryCount: 1,
          retryInterval: 500
        },
        {
          enabled: true,
          name: 'buffering',
          parallel: false,
          timeout: 10000,
          retryCount: 1,
          retryInterval: 1000
        },
        {
          enabled: true,
          name: 'output',
          parallel: false,
          timeout: 5000,
          retryCount: 3,
          retryInterval: 1000
        }
      ]
    });
  }
}