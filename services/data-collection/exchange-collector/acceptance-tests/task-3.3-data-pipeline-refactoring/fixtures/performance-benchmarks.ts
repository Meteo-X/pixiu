/**
 * Performance benchmarks and thresholds for pipeline testing
 */

/**
 * 性能基准定义
 */
export interface PerformanceBenchmark {
  name: string;
  description: string;
  thresholds: {
    latency: {
      p50: number;  // 50th percentile latency in ms
      p95: number;  // 95th percentile latency in ms
      p99: number;  // 99th percentile latency in ms
      max: number;  // Maximum acceptable latency in ms
    };
    throughput: {
      min: number;  // Minimum messages per second
      target: number; // Target messages per second
    };
    memory: {
      maxHeapUsage: number; // Maximum heap usage in bytes
      maxGCPause: number;   // Maximum GC pause in ms
      leakTolerance: number; // Memory growth rate tolerance
    };
    cpu: {
      maxUsage: number; // Maximum CPU usage percentage
    };
    errors: {
      maxRate: number; // Maximum error rate (0.0 - 1.0)
    };
  };
}

/**
 * 数据管道性能基准
 */
export const PIPELINE_BENCHMARKS: Record<string, PerformanceBenchmark> = {
  /**
   * 通用数据接收管道基准
   */
  UNIVERSAL_DATA_PIPELINE: {
    name: 'Universal Data Reception Pipeline',
    description: 'Basic data pipeline with minimal processing',
    thresholds: {
      latency: {
        p50: 10,    // 10ms
        p95: 50,    // 50ms
        p99: 100,   // 100ms
        max: 500    // 500ms
      },
      throughput: {
        min: 1000,    // 1k messages/sec minimum
        target: 5000  // 5k messages/sec target
      },
      memory: {
        maxHeapUsage: 100 * 1024 * 1024, // 100MB
        maxGCPause: 50,                   // 50ms
        leakTolerance: 0.05               // 5% growth tolerance
      },
      cpu: {
        maxUsage: 70 // 70%
      },
      errors: {
        maxRate: 0.001 // 0.1%
      }
    }
  },

  /**
   * 数据路由和分发基准
   */
  ROUTING_AND_DISTRIBUTION: {
    name: 'Data Routing and Distribution',
    description: 'Pipeline with complex routing logic',
    thresholds: {
      latency: {
        p50: 15,    // 15ms
        p95: 75,    // 75ms
        p99: 150,   // 150ms
        max: 1000   // 1s
      },
      throughput: {
        min: 800,     // 800 messages/sec minimum
        target: 3000  // 3k messages/sec target
      },
      memory: {
        maxHeapUsage: 150 * 1024 * 1024, // 150MB
        maxGCPause: 100,                  // 100ms
        leakTolerance: 0.1                // 10% growth tolerance
      },
      cpu: {
        maxUsage: 80 // 80%
      },
      errors: {
        maxRate: 0.005 // 0.5%
      }
    }
  },

  /**
   * 数据缓冲和批处理基准
   */
  BUFFERING_AND_BATCHING: {
    name: 'Data Buffering and Batch Processing',
    description: 'Pipeline with buffering and batching capabilities',
    thresholds: {
      latency: {
        p50: 20,    // 20ms
        p95: 100,   // 100ms
        p99: 200,   // 200ms
        max: 2000   // 2s (including batch flush time)
      },
      throughput: {
        min: 2000,    // 2k messages/sec minimum
        target: 10000 // 10k messages/sec target
      },
      memory: {
        maxHeapUsage: 200 * 1024 * 1024, // 200MB
        maxGCPause: 150,                  // 150ms
        leakTolerance: 0.15               // 15% growth tolerance
      },
      cpu: {
        maxUsage: 75 // 75%
      },
      errors: {
        maxRate: 0.002 // 0.2%
      }
    }
  },

  /**
   * 内存优化基准
   */
  MEMORY_OPTIMIZATION: {
    name: 'Memory Usage and Performance Optimization',
    description: 'Memory-optimized pipeline configuration',
    thresholds: {
      latency: {
        p50: 25,    // 25ms
        p95: 120,   // 120ms
        p99: 250,   // 250ms
        max: 1500   // 1.5s
      },
      throughput: {
        min: 1500,    // 1.5k messages/sec minimum
        target: 6000  // 6k messages/sec target
      },
      memory: {
        maxHeapUsage: 80 * 1024 * 1024,  // 80MB (optimized)
        maxGCPause: 30,                   // 30ms (optimized)
        leakTolerance: 0.02               // 2% growth tolerance
      },
      cpu: {
        maxUsage: 60 // 60% (optimized)
      },
      errors: {
        maxRate: 0.001 // 0.1%
      }
    }
  },

  /**
   * 高频率数据处理基准
   */
  HIGH_FREQUENCY_PROCESSING: {
    name: 'High Frequency Data Processing',
    description: 'Pipeline optimized for high-frequency trading data',
    thresholds: {
      latency: {
        p50: 5,     // 5ms
        p95: 25,    // 25ms
        p99: 50,    // 50ms
        max: 200    // 200ms
      },
      throughput: {
        min: 10000,   // 10k messages/sec minimum
        target: 50000 // 50k messages/sec target
      },
      memory: {
        maxHeapUsage: 300 * 1024 * 1024, // 300MB
        maxGCPause: 20,                   // 20ms
        leakTolerance: 0.05               // 5% growth tolerance
      },
      cpu: {
        maxUsage: 85 // 85%
      },
      errors: {
        maxRate: 0.0001 // 0.01%
      }
    }
  },

  /**
   * 压力测试基准
   */
  STRESS_TEST: {
    name: 'Stress Test Configuration',
    description: 'Maximum load stress test thresholds',
    thresholds: {
      latency: {
        p50: 50,    // 50ms
        p95: 200,   // 200ms
        p99: 500,   // 500ms
        max: 5000   // 5s
      },
      throughput: {
        min: 500,     // 500 messages/sec minimum
        target: 2000  // 2k messages/sec target
      },
      memory: {
        maxHeapUsage: 500 * 1024 * 1024, // 500MB
        maxGCPause: 500,                  // 500ms
        leakTolerance: 0.3                // 30% growth tolerance
      },
      cpu: {
        maxUsage: 95 // 95%
      },
      errors: {
        maxRate: 0.1 // 10%
      }
    }
  }
};

/**
 * 性能测试场景定义
 */
export interface PerformanceTestScenario {
  name: string;
  description: string;
  duration: number; // Test duration in milliseconds
  warmupTime: number; // Warmup time in milliseconds
  messageCount: number; // Total messages to process
  concurrency: number; // Concurrent processing threads
  messageRate: number; // Messages per second
  dataSize: number; // Average message size in bytes
  benchmark: PerformanceBenchmark;
}

/**
 * 预定义性能测试场景
 */
export const PERFORMANCE_TEST_SCENARIOS: Record<string, PerformanceTestScenario> = {
  /**
   * 基础性能测试
   */
  BASIC_PERFORMANCE: {
    name: 'Basic Performance Test',
    description: 'Basic pipeline performance validation',
    duration: 30000,      // 30 seconds
    warmupTime: 5000,     // 5 seconds warmup
    messageCount: 10000,  // 10k messages
    concurrency: 10,      // 10 concurrent processors
    messageRate: 1000,    // 1k messages/sec
    dataSize: 1024,       // 1KB per message
    benchmark: PIPELINE_BENCHMARKS.UNIVERSAL_DATA_PIPELINE
  },

  /**
   * 高吞吐量测试
   */
  HIGH_THROUGHPUT: {
    name: 'High Throughput Test',
    description: 'High throughput pipeline validation',
    duration: 60000,      // 60 seconds
    warmupTime: 10000,    // 10 seconds warmup
    messageCount: 100000, // 100k messages
    concurrency: 50,      // 50 concurrent processors
    messageRate: 10000,   // 10k messages/sec
    dataSize: 512,        // 512 bytes per message
    benchmark: PIPELINE_BENCHMARKS.HIGH_FREQUENCY_PROCESSING
  },

  /**
   * 内存压力测试
   */
  MEMORY_STRESS: {
    name: 'Memory Stress Test',
    description: 'Memory usage and GC pressure validation',
    duration: 120000,     // 2 minutes
    warmupTime: 15000,    // 15 seconds warmup
    messageCount: 50000,  // 50k messages
    concurrency: 20,      // 20 concurrent processors
    messageRate: 2000,    // 2k messages/sec
    dataSize: 4096,       // 4KB per message
    benchmark: PIPELINE_BENCHMARKS.MEMORY_OPTIMIZATION
  },

  /**
   * 延迟测试
   */
  LATENCY_TEST: {
    name: 'Latency Test',
    description: 'End-to-end latency validation',
    duration: 45000,      // 45 seconds
    warmupTime: 5000,     // 5 seconds warmup
    messageCount: 20000,  // 20k messages
    concurrency: 5,       // 5 concurrent processors
    messageRate: 500,     // 500 messages/sec
    dataSize: 256,        // 256 bytes per message
    benchmark: PIPELINE_BENCHMARKS.UNIVERSAL_DATA_PIPELINE
  },

  /**
   * 批处理性能测试
   */
  BATCH_PROCESSING: {
    name: 'Batch Processing Test',
    description: 'Batch processing and buffering validation',
    duration: 90000,      // 90 seconds
    warmupTime: 10000,    // 10 seconds warmup
    messageCount: 80000,  // 80k messages
    concurrency: 30,      // 30 concurrent processors
    messageRate: 5000,    // 5k messages/sec
    dataSize: 1024,       // 1KB per message
    benchmark: PIPELINE_BENCHMARKS.BUFFERING_AND_BATCHING
  }
};

/**
 * 性能测试工具类
 */
export class PerformanceTestUtils {
  /**
   * 验证延迟是否符合基准
   */
  static validateLatency(latencies: number[], benchmark: PerformanceBenchmark): {
    passed: boolean;
    results: {
      p50: { value: number; passed: boolean };
      p95: { value: number; passed: boolean };
      p99: { value: number; passed: boolean };
      max: { value: number; passed: boolean };
    };
  } {
    const sorted = latencies.sort((a, b) => a - b);
    const len = sorted.length;
    
    const p50 = sorted[Math.floor(len * 0.5)];
    const p95 = sorted[Math.floor(len * 0.95)];
    const p99 = sorted[Math.floor(len * 0.99)];
    const max = sorted[len - 1];
    
    const results = {
      p50: { value: p50, passed: p50 <= benchmark.thresholds.latency.p50 },
      p95: { value: p95, passed: p95 <= benchmark.thresholds.latency.p95 },
      p99: { value: p99, passed: p99 <= benchmark.thresholds.latency.p99 },
      max: { value: max, passed: max <= benchmark.thresholds.latency.max }
    };
    
    const passed = results.p50.passed && results.p95.passed && 
                   results.p99.passed && results.max.passed;
    
    return { passed, results };
  }
  
  /**
   * 验证吞吐量是否符合基准
   */
  static validateThroughput(
    messageCount: number, 
    durationMs: number, 
    benchmark: PerformanceBenchmark
  ): { passed: boolean; messagesPerSecond: number } {
    const messagesPerSecond = (messageCount / durationMs) * 1000;
    const passed = messagesPerSecond >= benchmark.thresholds.throughput.min;
    
    return { passed, messagesPerSecond };
  }
  
  /**
   * 验证内存使用是否符合基准
   */
  static validateMemoryUsage(
    memoryStats: { heapUsed: number; maxGCPause?: number },
    benchmark: PerformanceBenchmark
  ): {
    passed: boolean;
    heapUsage: { value: number; passed: boolean };
    gcPause?: { value: number; passed: boolean };
  } {
    const heapUsage = {
      value: memoryStats.heapUsed,
      passed: memoryStats.heapUsed <= benchmark.thresholds.memory.maxHeapUsage
    };
    
    let gcPause;
    if (memoryStats.maxGCPause !== undefined) {
      gcPause = {
        value: memoryStats.maxGCPause,
        passed: memoryStats.maxGCPause <= benchmark.thresholds.memory.maxGCPause
      };
    }
    
    const passed = heapUsage.passed && (gcPause?.passed !== false);
    
    return { passed, heapUsage, gcPause };
  }
  
  /**
   * 验证错误率是否符合基准
   */
  static validateErrorRate(
    errorCount: number,
    totalCount: number,
    benchmark: PerformanceBenchmark
  ): { passed: boolean; errorRate: number } {
    const errorRate = totalCount > 0 ? errorCount / totalCount : 0;
    const passed = errorRate <= benchmark.thresholds.errors.maxRate;
    
    return { passed, errorRate };
  }
  
  /**
   * 生成性能报告
   */
  static generatePerformanceReport(
    scenario: PerformanceTestScenario,
    results: {
      latencies: number[];
      messageCount: number;
      duration: number;
      errorCount: number;
      memoryStats: { heapUsed: number; maxGCPause?: number };
    }
  ): {
    scenario: string;
    passed: boolean;
    summary: string;
    details: {
      latency: any;
      throughput: any;
      memory: any;
      errors: any;
    };
  } {
    const latencyValidation = this.validateLatency(results.latencies, scenario.benchmark);
    const throughputValidation = this.validateThroughput(
      results.messageCount, 
      results.duration, 
      scenario.benchmark
    );
    const memoryValidation = this.validateMemoryUsage(results.memoryStats, scenario.benchmark);
    const errorValidation = this.validateErrorRate(
      results.errorCount, 
      results.messageCount, 
      scenario.benchmark
    );
    
    const passed = latencyValidation.passed && 
                   throughputValidation.passed && 
                   memoryValidation.passed && 
                   errorValidation.passed;
    
    const summary = passed 
      ? `✅ All performance benchmarks passed for ${scenario.name}`
      : `❌ Performance benchmarks failed for ${scenario.name}`;
    
    return {
      scenario: scenario.name,
      passed,
      summary,
      details: {
        latency: latencyValidation,
        throughput: throughputValidation,
        memory: memoryValidation,
        errors: errorValidation
      }
    };
  }
}