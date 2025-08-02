/**
 * 错误样本数据
 * 
 * 提供各种类型的错误样本，用于测试错误处理器的分类和处理功能
 */

import { ErrorInfo } from '../../../src/connector/interfaces';
import { ErrorCategory, ErrorSeverity, RecoveryStrategy } from '../../../src/connector/ErrorHandler';

/**
 * 连接错误样本
 */
export const connectionErrors = [
  {
    error: new Error('Connection timeout'),
    expectedCategory: ErrorCategory.CONNECTION,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: '连接超时错误'
  },
  {
    error: new Error('Connection refused'),
    expectedCategory: ErrorCategory.CONNECTION,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: '连接被拒绝错误'
  },
  {
    error: new Error('Connection lost'),
    expectedCategory: ErrorCategory.CONNECTION,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: '连接丢失错误'
  },
  {
    error: new Error('Network unreachable'),
    expectedCategory: ErrorCategory.CONNECTION,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: '网络不可达错误'
  }
];

/**
 * 数据解析错误样本
 */
export const dataParsingErrors = [
  {
    error: new Error('Invalid JSON format'),
    expectedCategory: ErrorCategory.DATA_PARSING,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: 'JSON格式错误'
  },
  {
    error: new Error('Parse error at line 5'),
    expectedCategory: ErrorCategory.DATA_PARSING,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: '解析错误'
  },
  {
    error: new Error('Malformed data structure'),
    expectedCategory: ErrorCategory.DATA_PARSING,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: '数据结构错误'
  },
  {
    error: new Error('Unexpected token in JSON'),
    expectedCategory: ErrorCategory.DATA_PARSING,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: 'JSON令牌错误'
  }
];

/**
 * 订阅错误样本
 */
export const subscriptionErrors = [
  {
    error: new Error('Subscribe failed'),
    expectedCategory: ErrorCategory.SUBSCRIPTION,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '订阅失败错误'
  },
  {
    error: new Error('Subscription timeout'),
    expectedCategory: ErrorCategory.SUBSCRIPTION,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '订阅超时错误'
  },
  {
    error: new Error('Invalid subscription parameters'),
    expectedCategory: ErrorCategory.SUBSCRIPTION,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '订阅参数错误'
  }
];

/**
 * PubSub 错误样本
 */
export const pubsubErrors = [
  {
    error: new Error('PubSub timeout'),
    expectedCategory: ErrorCategory.PUBSUB,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: 'PubSub超时错误'
  },
  {
    error: new Error('Publish failed'),
    expectedCategory: ErrorCategory.PUBSUB,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '发布失败错误'
  },
  {
    error: new Error('Topic not found'),
    expectedCategory: ErrorCategory.PUBSUB,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '主题未找到错误'
  }
];

/**
 * 认证错误样本（致命错误）
 */
export const authenticationErrors = [
  {
    error: new Error('Authentication failed'),
    expectedCategory: ErrorCategory.AUTHENTICATION,
    expectedSeverity: ErrorSeverity.CRITICAL,
    expectedStrategy: RecoveryStrategy.ESCALATE,
    expectedFatal: true,
    description: '认证失败错误'
  },
  {
    error: new Error('Invalid API key'),
    expectedCategory: ErrorCategory.AUTHENTICATION,
    expectedSeverity: ErrorSeverity.CRITICAL,
    expectedStrategy: RecoveryStrategy.ESCALATE,
    expectedFatal: true,
    description: 'API密钥错误'
  },
  {
    error: new Error('Token expired'),
    expectedCategory: ErrorCategory.AUTHENTICATION,
    expectedSeverity: ErrorSeverity.CRITICAL,
    expectedStrategy: RecoveryStrategy.ESCALATE,
    expectedFatal: true,
    description: '令牌过期错误'
  }
];

/**
 * 限流错误样本
 */
export const rateLimitErrors = [
  {
    error: new Error('Rate limit exceeded'),
    expectedCategory: ErrorCategory.RATE_LIMIT,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.CIRCUIT_BREAK,
    description: '限流错误'
  },
  {
    error: new Error('Too many requests'),
    expectedCategory: ErrorCategory.RATE_LIMIT,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.CIRCUIT_BREAK,
    description: '请求过多错误'
  },
  {
    error: { code: '429', message: 'Rate limited' },
    expectedCategory: ErrorCategory.RATE_LIMIT,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.CIRCUIT_BREAK,
    description: 'HTTP 429错误'
  }
];

/**
 * 网络错误样本
 */
export const networkErrors = [
  {
    error: new Error('Network timeout'),
    expectedCategory: ErrorCategory.NETWORK,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '网络超时错误'
  },
  {
    error: new Error('DNS resolution failed'),
    expectedCategory: ErrorCategory.NETWORK,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: 'DNS解析错误'
  },
  {
    error: new Error('Network congestion detected'),
    expectedCategory: ErrorCategory.NETWORK,
    expectedSeverity: ErrorSeverity.MEDIUM,
    expectedStrategy: RecoveryStrategy.RETRY,
    description: '网络拥塞错误'
  }
];

/**
 * 心跳错误样本
 */
export const heartbeatErrors = [
  {
    error: new Error('Heartbeat timeout'),
    expectedCategory: ErrorCategory.HEARTBEAT,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: '心跳超时错误'
  },
  {
    error: new Error('Ping failed'),
    expectedCategory: ErrorCategory.HEARTBEAT,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: 'Ping失败错误'
  },
  {
    error: new Error('Pong not received'),
    expectedCategory: ErrorCategory.HEARTBEAT,
    expectedSeverity: ErrorSeverity.HIGH,
    expectedStrategy: RecoveryStrategy.RECONNECT,
    description: 'Pong未收到错误'
  }
];

/**
 * 配置错误样本（致命错误）
 */
export const configErrors = [
  {
    error: new Error('Configuration error'),
    expectedCategory: ErrorCategory.CONFIG,
    expectedSeverity: ErrorSeverity.CRITICAL,
    expectedStrategy: RecoveryStrategy.ESCALATE,
    expectedFatal: true,
    description: '配置错误'
  },
  {
    error: new Error('Invalid setting value'),
    expectedCategory: ErrorCategory.CONFIG,
    expectedSeverity: ErrorSeverity.CRITICAL,
    expectedStrategy: RecoveryStrategy.ESCALATE,
    expectedFatal: true,
    description: '设置值错误'
  }
];

/**
 * 未知错误样本
 */
export const unknownErrors = [
  {
    error: new Error('Something went wrong'),
    expectedCategory: ErrorCategory.UNKNOWN,
    expectedSeverity: ErrorSeverity.LOW,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: '未知错误'
  },
  {
    error: new Error('Unexpected error occurred'),
    expectedCategory: ErrorCategory.UNKNOWN,
    expectedSeverity: ErrorSeverity.LOW,
    expectedStrategy: RecoveryStrategy.IGNORE,
    description: '意外错误'
  }
];

/**
 * 所有错误样本的合集
 */
export const allErrorSamples = [
  ...connectionErrors,
  ...dataParsingErrors,
  ...subscriptionErrors,
  ...pubsubErrors,
  ...authenticationErrors,
  ...rateLimitErrors,
  ...networkErrors,
  ...heartbeatErrors,
  ...configErrors,
  ...unknownErrors
];

/**
 * 按分类分组的错误样本
 */
export const errorSamplesByCategory = {
  [ErrorCategory.CONNECTION]: connectionErrors,
  [ErrorCategory.DATA_PARSING]: dataParsingErrors,
  [ErrorCategory.SUBSCRIPTION]: subscriptionErrors,
  [ErrorCategory.PUBSUB]: pubsubErrors,
  [ErrorCategory.AUTHENTICATION]: authenticationErrors,
  [ErrorCategory.RATE_LIMIT]: rateLimitErrors,
  [ErrorCategory.NETWORK]: networkErrors,
  [ErrorCategory.HEARTBEAT]: heartbeatErrors,
  [ErrorCategory.CONFIG]: configErrors,
  [ErrorCategory.UNKNOWN]: unknownErrors
};

/**
 * 按严重程度分组的错误样本
 */
export const errorSamplesBySeverity = {
  [ErrorSeverity.LOW]: unknownErrors,
  [ErrorSeverity.MEDIUM]: [
    ...dataParsingErrors,
    ...subscriptionErrors,
    ...rateLimitErrors,
    ...networkErrors
  ],
  [ErrorSeverity.HIGH]: [
    ...connectionErrors,
    ...pubsubErrors,
    ...heartbeatErrors
  ],
  [ErrorSeverity.CRITICAL]: [
    ...authenticationErrors,
    ...configErrors
  ]
};

/**
 * 错误信息对象样本
 */
export const errorInfoSamples: ErrorInfo[] = [
  {
    timestamp: Date.now(),
    message: 'Connection timeout occurred',
    code: 'CONN_TIMEOUT',
    type: 'CONNECTION',
    context: {
      connectionId: 'test-conn-1',
      timeout: 5000,
      endpoint: 'wss://stream.binance.com'
    },
    fatal: false
  },
  {
    timestamp: Date.now() - 1000,
    message: 'Invalid JSON in message',
    code: 'PARSE_ERROR',
    type: 'DATA',
    context: {
      rawData: '{"invalid": json}',
      messageId: 'msg-123'
    },
    fatal: false
  },
  {
    timestamp: Date.now() - 2000,
    message: 'Authentication failed',
    code: 'AUTH_FAILED',
    type: 'UNKNOWN',
    context: {
      apiKey: 'hidden',
      endpoint: '/api/v3/account'
    },
    fatal: true
  },
  {
    timestamp: Date.now() - 3000,
    message: 'Rate limit exceeded',
    code: '429',
    type: 'PROTOCOL',
    context: {
      requestsPerMinute: 1200,
      limit: 1000
    },
    fatal: false
  }
];

/**
 * 复杂错误场景样本
 */
export const complexErrorScenarios = [
  {
    name: 'Network Degradation',
    description: '网络逐步恶化场景',
    errors: [
      ...Array(5).fill(null).map((_, i) => ({
        error: new Error(`Network timeout ${i + 1}`),
        delay: i * 100
      })),
      ...Array(3).fill(null).map((_, i) => ({
        error: new Error(`Connection lost ${i + 1}`),
        delay: 500 + i * 200
      }))
    ]
  },
  {
    name: 'Service Overload',
    description: '服务过载场景',
    errors: [
      ...Array(10).fill(null).map((_, i) => ({
        error: new Error('Rate limit exceeded'),
        delay: i * 50
      })),
      ...Array(5).fill(null).map((_, i) => ({
        error: new Error('Service unavailable'),
        delay: 500 + i * 100
      }))
    ]
  },
  {
    name: 'Data Corruption',
    description: '数据损坏场景',
    errors: [
      { error: new Error('Invalid JSON format'), delay: 0 },
      { error: new Error('Schema validation failed'), delay: 100 },
      { error: new Error('Malformed data structure'), delay: 200 },
      { error: new Error('Checksum mismatch'), delay: 300 }
    ]
  },
  {
    name: 'Authentication Issues',
    description: '认证问题场景',
    errors: [
      { error: new Error('Token expired'), delay: 0 },
      { error: new Error('Invalid API key'), delay: 1000 },
      { error: new Error('Authentication failed'), delay: 2000 }
    ]
  }
];

/**
 * 错误恢复测试样本
 */
export const errorRecoveryScenarios = [
  {
    name: 'Connection Recovery',
    description: '连接恢复场景',
    phases: [
      {
        name: 'failure',
        errors: Array(5).fill(null).map(() => new Error('Connection failed')),
        duration: 500
      },
      {
        name: 'retry',
        errors: Array(3).fill(null).map(() => new Error('Reconnection failed')),
        duration: 300
      },
      {
        name: 'recovery',
        errors: [],
        duration: 200
      }
    ]
  },
  {
    name: 'Circuit Breaker Recovery',
    description: '熔断器恢复场景',
    phases: [
      {
        name: 'overload',
        errors: Array(20).fill(null).map(() => new Error('Service overloaded')),
        duration: 1000
      },
      {
        name: 'circuit_open',
        errors: [],
        duration: 2000
      },
      {
        name: 'circuit_half_open',
        errors: Array(2).fill(null).map(() => new Error('Probe failed')),
        duration: 500
      },
      {
        name: 'circuit_closed',
        errors: [],
        duration: 500
      }
    ]
  }
];

/**
 * 获取随机错误样本
 */
export function getRandomErrorSample(category?: ErrorCategory) {
  if (category && errorSamplesByCategory[category]) {
    const samples = errorSamplesByCategory[category];
    return samples[Math.floor(Math.random() * samples.length)];
  }
  
  return allErrorSamples[Math.floor(Math.random() * allErrorSamples.length)];
}

/**
 * 获取指定严重程度的错误样本
 */
export function getErrorSamplesBySeverity(severity: ErrorSeverity) {
  return errorSamplesBySeverity[severity] || [];
}

/**
 * 创建自定义错误样本
 */
export function createCustomErrorSample(
  message: string,
  category: ErrorCategory,
  severity: ErrorSeverity,
  strategy: RecoveryStrategy,
  fatal: boolean = false
) {
  return {
    error: new Error(message),
    expectedCategory: category,
    expectedSeverity: severity,
    expectedStrategy: strategy,
    expectedFatal: fatal,
    description: `Custom ${severity} ${category} error`
  };
}