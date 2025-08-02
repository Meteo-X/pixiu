/**
 * 延迟样本数据
 * 
 * 提供各种延迟测量样本，用于测试延迟监控器的统计和分析功能
 */

import { LatencyType, LatencyMeasurement } from '../../../src/connector/LatencyMonitor';

/**
 * 网络延迟样本分布
 */
export const networkLatencyDistributions = {
  excellent: {
    name: '优秀网络条件',
    description: '理想网络环境下的延迟分布',
    samples: Array.from({ length: 1000 }, () => 10 + Math.random() * 20), // 10-30ms
    expectedMean: 20,
    expectedP95: 28,
    expectedP99: 30
  },
  
  good: {
    name: '良好网络条件',
    description: '正常网络环境下的延迟分布',
    samples: Array.from({ length: 1000 }, () => 20 + Math.random() * 40), // 20-60ms
    expectedMean: 40,
    expectedP95: 56,
    expectedP99: 60
  },
  
  fair: {
    name: '一般网络条件',
    description: '略有拥塞的网络环境',
    samples: Array.from({ length: 1000 }, () => 50 + Math.random() * 100), // 50-150ms
    expectedMean: 100,
    expectedP95: 140,
    expectedP99: 150
  },
  
  poor: {
    name: '较差网络条件',
    description: '网络拥塞或不稳定环境',
    samples: Array.from({ length: 1000 }, () => 100 + Math.random() * 300), // 100-400ms
    expectedMean: 250,
    expectedP95: 370,
    expectedP99: 400
  },
  
  critical: {
    name: '严重网络问题',
    description: '网络严重拥塞或故障',
    samples: Array.from({ length: 1000 }, () => 500 + Math.random() * 1500), // 500-2000ms
    expectedMean: 1250,
    expectedP95: 1850,
    expectedP99: 2000
  }
};

/**
 * 处理延迟样本分布
 */
export const processingLatencyDistributions = {
  fast: {
    name: '快速处理',
    description: '优化良好的处理性能',
    samples: Array.from({ length: 1000 }, () => 1 + Math.random() * 4), // 1-5ms
    expectedMean: 3,
    expectedP95: 4.8,
    expectedP99: 5
  },
  
  normal: {
    name: '正常处理',
    description: '标准的处理性能',
    samples: Array.from({ length: 1000 }, () => 3 + Math.random() * 12), // 3-15ms
    expectedMean: 9,
    expectedP95: 14.2,
    expectedP99: 15
  },
  
  slow: {
    name: '慢速处理',
    description: '处理负载较重',
    samples: Array.from({ length: 1000 }, () => 10 + Math.random() * 40), // 10-50ms
    expectedMean: 30,
    expectedP95: 47,
    expectedP99: 50
  },
  
  overloaded: {
    name: '过载处理',
    description: '系统过载状态',
    samples: Array.from({ length: 1000 }, () => 50 + Math.random() * 150), // 50-200ms
    expectedMean: 125,
    expectedP95: 185,
    expectedP99: 200
  }
};

/**
 * 端到端延迟样本分布
 */
export const endToEndLatencyDistributions = {
  optimal: {
    name: '最优端到端',
    description: '理想的端到端性能',
    samples: Array.from({ length: 1000 }, () => 30 + Math.random() * 40), // 30-70ms
    expectedMean: 50,
    expectedP95: 66,
    expectedP99: 70
  },
  
  typical: {
    name: '典型端到端',
    description: '正常的端到端性能',
    samples: Array.from({ length: 1000 }, () => 60 + Math.random() * 90), // 60-150ms
    expectedMean: 105,
    expectedP95: 141,
    expectedP99: 150
  },
  
  degraded: {
    name: '降级端到端',
    description: '性能有所下降',
    samples: Array.from({ length: 1000 }, () => 150 + Math.random() * 300), // 150-450ms
    expectedMean: 300,
    expectedP95: 420,
    expectedP99: 450
  },
  
  critical: {
    name: '严重端到端',
    description: '端到端性能严重下降',
    samples: Array.from({ length: 1000 }, () => 500 + Math.random() * 1000), // 500-1500ms
    expectedMean: 1000,
    expectedP95: 1400,
    expectedP99: 1500
  }
};

/**
 * 心跳延迟样本分布
 */
export const heartbeatLatencyDistributions = {
  healthy: {
    name: '健康心跳',
    description: '心跳响应正常',
    samples: Array.from({ length: 100 }, () => 15000 + Math.random() * 10000), // 15-25s
    expectedMean: 20000,
    expectedP95: 24500,
    expectedP99: 25000
  },
  
  warning: {
    name: '心跳告警',
    description: '心跳响应偏慢',
    samples: Array.from({ length: 100 }, () => 25000 + Math.random() * 15000), // 25-40s
    expectedMean: 32500,
    expectedP95: 38500,
    expectedP99: 40000
  },
  
  critical: {
    name: '心跳严重',
    description: '心跳响应严重延迟',
    samples: Array.from({ length: 100 }, () => 45000 + Math.random() * 25000), // 45-70s
    expectedMean: 57500,
    expectedP95: 67000,
    expectedP99: 70000
  }
};

/**
 * 订阅延迟样本分布
 */
export const subscriptionLatencyDistributions = {
  fast: {
    name: '快速订阅',
    description: '订阅操作响应迅速',
    samples: Array.from({ length: 200 }, () => 500 + Math.random() * 1500), // 0.5-2s
    expectedMean: 1250,
    expectedP95: 1900,
    expectedP99: 2000
  },
  
  normal: {
    name: '正常订阅',
    description: '标准的订阅响应时间',
    samples: Array.from({ length: 200 }, () => 2000 + Math.random() * 4000), // 2-6s
    expectedMean: 4000,
    expectedP95: 5800,
    expectedP99: 6000
  },
  
  slow: {
    name: '慢速订阅',
    description: '订阅响应较慢',
    samples: Array.from({ length: 200 }, () => 6000 + Math.random() * 9000), // 6-15s
    expectedMean: 10500,
    expectedP95: 14100,
    expectedP99: 15000
  },
  
  timeout: {
    name: '订阅超时',
    description: '订阅操作接近超时',
    samples: Array.from({ length: 200 }, () => 15000 + Math.random() * 15000), // 15-30s
    expectedMean: 22500,
    expectedP95: 28500,
    expectedP99: 30000
  }
};

/**
 * 综合延迟场景
 */
export const latencyScenarios = [
  {
    name: 'Normal Operation',
    description: '正常运行场景',
    duration: 3600, // 1小时
    patterns: [
      {
        type: LatencyType.NETWORK,
        distribution: networkLatencyDistributions.good,
        frequency: 1000 // 每秒1000次测量
      },
      {
        type: LatencyType.PROCESSING,
        distribution: processingLatencyDistributions.normal,
        frequency: 1000
      },
      {
        type: LatencyType.END_TO_END,
        distribution: endToEndLatencyDistributions.typical,
        frequency: 500
      }
    ]
  },
  
  {
    name: 'Peak Traffic',
    description: '高峰流量场景',
    duration: 7200, // 2小时
    patterns: [
      {
        type: LatencyType.NETWORK,
        distribution: networkLatencyDistributions.fair,
        frequency: 2000
      },
      {
        type: LatencyType.PROCESSING,
        distribution: processingLatencyDistributions.slow,
        frequency: 2000
      },
      {
        type: LatencyType.END_TO_END,
        distribution: endToEndLatencyDistributions.degraded,
        frequency: 1000
      }
    ]
  },
  
  {
    name: 'Network Issues',
    description: '网络问题场景',
    duration: 1800, // 30分钟
    patterns: [
      {
        type: LatencyType.NETWORK,
        distribution: networkLatencyDistributions.poor,
        frequency: 500
      },
      {
        type: LatencyType.PROCESSING,
        distribution: processingLatencyDistributions.normal,
        frequency: 500
      },
      {
        type: LatencyType.END_TO_END,
        distribution: endToEndLatencyDistributions.degraded,
        frequency: 300
      }
    ]
  },
  
  {
    name: 'System Overload',
    description: '系统过载场景',
    duration: 900, // 15分钟
    patterns: [
      {
        type: LatencyType.NETWORK,
        distribution: networkLatencyDistributions.critical,
        frequency: 200
      },
      {
        type: LatencyType.PROCESSING,
        distribution: processingLatencyDistributions.overloaded,
        frequency: 200
      },
      {
        type: LatencyType.END_TO_END,
        distribution: endToEndLatencyDistributions.critical,
        frequency: 100
      }
    ]
  }
];

/**
 * 延迟趋势样本
 */
export const latencyTrendSamples = {
  improving: {
    name: '性能改善趋势',
    description: '延迟逐步降低',
    phases: [
      { duration: 300, meanLatency: 200, variance: 50 },
      { duration: 300, meanLatency: 150, variance: 40 },
      { duration: 300, meanLatency: 100, variance: 30 },
      { duration: 300, meanLatency: 75, variance: 20 },
      { duration: 300, meanLatency: 50, variance: 15 }
    ]
  },
  
  degrading: {
    name: '性能退化趋势',
    description: '延迟逐步增加',
    phases: [
      { duration: 300, meanLatency: 50, variance: 15 },
      { duration: 300, meanLatency: 75, variance: 20 },
      { duration: 300, meanLatency: 100, variance: 30 },
      { duration: 300, meanLatency: 150, variance: 40 },
      { duration: 300, meanLatency: 200, variance: 50 }
    ]
  },
  
  stable: {
    name: '稳定性能',
    description: '延迟保持稳定',
    phases: [
      { duration: 1500, meanLatency: 60, variance: 15 }
    ]
  },
  
  volatile: {
    name: '波动性能',
    description: '延迟波动剧烈',
    phases: [
      { duration: 200, meanLatency: 50, variance: 10 },
      { duration: 200, meanLatency: 150, variance: 30 },
      { duration: 200, meanLatency: 75, variance: 20 },
      { duration: 200, meanLatency: 200, variance: 50 },
      { duration: 200, meanLatency: 100, variance: 25 }
    ]
  }
};

/**
 * 延迟异常样本
 */
export const latencyAnomalies = [
  {
    name: 'Latency Spike',
    description: '延迟尖峰',
    normalRange: [20, 60],
    anomalyValues: [500, 800, 1200, 600, 400],
    duration: 300
  },
  
  {
    name: 'Latency Drop',
    description: '延迟骤降（可能的测量错误）',
    normalRange: [50, 100],
    anomalyValues: [0, 1, 2, 0.5, 1.5],
    duration: 100
  },
  
  {
    name: 'Bimodal Distribution',
    description: '双峰分布',
    normalRange: [30, 70],
    anomalyValues: [
      ...Array(50).fill(null).map(() => 30 + Math.random() * 20),
      ...Array(50).fill(null).map(() => 200 + Math.random() * 50)
    ],
    duration: 1000
  }
];

/**
 * 基准测试样本
 */
export const baselineTestSamples = {
  target_performance: {
    [LatencyType.NETWORK]: {
      samples: Array.from({ length: 1000 }, () => 45 + Math.random() * 10), // 45-55ms
      expectedBaseline: 50,
      tolerance: 10 // 10%
    },
    [LatencyType.PROCESSING]: {
      samples: Array.from({ length: 1000 }, () => 4 + Math.random() * 2), // 4-6ms
      expectedBaseline: 5,
      tolerance: 20 // 20%
    },
    [LatencyType.END_TO_END]: {
      samples: Array.from({ length: 1000 }, () => 90 + Math.random() * 20), // 90-110ms
      expectedBaseline: 100,
      tolerance: 15 // 15%
    }
  },
  
  acceptable_performance: {
    [LatencyType.NETWORK]: {
      samples: Array.from({ length: 1000 }, () => 70 + Math.random() * 20), // 70-90ms
      expectedBaseline: 50,
      tolerance: 50 // 50%，在容忍范围内
    },
    [LatencyType.PROCESSING]: {
      samples: Array.from({ length: 1000 }, () => 6 + Math.random() * 3), // 6-9ms
      expectedBaseline: 5,
      tolerance: 50 // 50%，在容忍范围内
    }
  },
  
  poor_performance: {
    [LatencyType.NETWORK]: {
      samples: Array.from({ length: 1000 }, () => 100 + Math.random() * 50), // 100-150ms
      expectedBaseline: 50,
      tolerance: 50 // 超出容忍范围
    },
    [LatencyType.PROCESSING]: {
      samples: Array.from({ length: 1000 }, () => 15 + Math.random() * 10), // 15-25ms
      expectedBaseline: 5,
      tolerance: 50 // 超出容忍范围
    }
  }
};

/**
 * 生成指定分布的延迟测量样本
 */
export function generateLatencyMeasurements(
  type: LatencyType,
  count: number,
  distributionName: string
): LatencyMeasurement[] {
  const distributions = {
    [LatencyType.NETWORK]: networkLatencyDistributions,
    [LatencyType.PROCESSING]: processingLatencyDistributions,
    [LatencyType.END_TO_END]: endToEndLatencyDistributions,
    [LatencyType.HEARTBEAT]: heartbeatLatencyDistributions,
    [LatencyType.SUBSCRIPTION]: subscriptionLatencyDistributions
  };

  const distribution = distributions[type]?.[distributionName as keyof typeof distributions[typeof type]];
  if (!distribution) {
    throw new Error(`Unknown distribution ${distributionName} for type ${type}`);
  }

  const measurements: LatencyMeasurement[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    const sampleIndex = Math.floor(Math.random() * distribution.samples.length);
    const value = distribution.samples[sampleIndex];
    
    measurements.push({
      type,
      value,
      timestamp: baseTime + i * 100, // 每100ms一个测量
      source: `test-source-${i % 5}`,
      metadata: {
        distribution: distributionName,
        sampleIndex
      }
    });
  }

  return measurements;
}

/**
 * 生成延迟趋势数据
 */
export function generateLatencyTrend(
  type: LatencyType,
  trendName: string
): LatencyMeasurement[] {
  const trend = latencyTrendSamples[trendName as keyof typeof latencyTrendSamples];
  if (!trend) {
    throw new Error(`Unknown trend ${trendName}`);
  }

  const measurements: LatencyMeasurement[] = [];
  let currentTime = Date.now();

  trend.phases.forEach((phase, phaseIndex) => {
    for (let i = 0; i < phase.duration; i++) {
      const value = phase.meanLatency + (Math.random() - 0.5) * phase.variance;
      
      measurements.push({
        type,
        value: Math.max(0, value), // 确保延迟不为负
        timestamp: currentTime + i * 1000, // 每秒一个测量
        source: `trend-phase-${phaseIndex}`,
        metadata: {
          trend: trendName,
          phase: phaseIndex,
          phaseMean: phase.meanLatency
        }
      });
    }
    
    currentTime += phase.duration * 1000;
  });

  return measurements;
}

/**
 * 生成延迟异常数据
 */
export function generateLatencyAnomalies(
  type: LatencyType,
  anomalyName: string
): LatencyMeasurement[] {
  const anomaly = latencyAnomalies.find(a => a.name === anomalyName);
  if (!anomaly) {
    throw new Error(`Unknown anomaly ${anomalyName}`);
  }

  const measurements: LatencyMeasurement[] = [];
  const baseTime = Date.now();

  // 生成正常数据
  for (let i = 0; i < anomaly.duration * 0.7; i++) {
    const value = anomaly.normalRange[0] + Math.random() * (anomaly.normalRange[1] - anomaly.normalRange[0]);
    measurements.push({
      type,
      value,
      timestamp: baseTime + i * 1000,
      source: 'normal-operation',
      metadata: { anomaly: anomalyName, phase: 'normal' }
    });
  }

  // 插入异常数据
  anomaly.anomalyValues.forEach((value, index) => {
    measurements.push({
      type,
      value,
      timestamp: baseTime + (anomaly.duration * 0.7 + index) * 1000,
      source: 'anomaly-source',
      metadata: { anomaly: anomalyName, phase: 'anomaly', anomalyIndex: index }
    });
  });

  // 恢复正常数据
  const remainingDuration = anomaly.duration * 0.3 - anomaly.anomalyValues.length;
  for (let i = 0; i < remainingDuration; i++) {
    const value = anomaly.normalRange[0] + Math.random() * (anomaly.normalRange[1] - anomaly.normalRange[0]);
    measurements.push({
      type,
      value,
      timestamp: baseTime + (anomaly.duration * 0.7 + anomaly.anomalyValues.length + i) * 1000,
      source: 'recovery-operation',
      metadata: { anomaly: anomalyName, phase: 'recovery' }
    });
  }

  return measurements;
}