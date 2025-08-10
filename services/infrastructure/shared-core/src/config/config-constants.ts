/**
 * 配置常量定义
 * 统一管理所有配置相关的常量，避免重复定义
 */

/**
 * 默认端口配置
 */
export const DEFAULT_PORTS = {
  // 服务端口
  SERVICE: 8080,
  WEBSOCKET_PROXY: 8081,
  METRICS: 9090,
  
  // 开发环境端口偏移
  DEV_OFFSET: 1000,
  TEST_OFFSET: 2000,
} as const;

/**
 * 环境变量映射配置
 * 统一定义环境变量到配置路径的映射关系
 */
export const ENV_MAPPINGS = [
  // 服务基础配置
  { env: 'PORT', path: 'service.server.port', type: 'number' as const },
  { env: 'HOST', path: 'service.server.host', type: 'string' as const },
  { env: 'NODE_ENV', path: 'service.environment', type: 'string' as const },
  
  // 日志配置
  { env: 'LOG_LEVEL', path: 'logging.level', type: 'string' as const },
  { env: 'LOG_FORMAT', path: 'logging.format', type: 'string' as const },
  
  // Pub/Sub配置
  { env: 'PUBSUB_PROJECT_ID', path: 'pubsub.projectId', type: 'string' as const },
  { env: 'PUBSUB_EMULATOR_HOST', path: 'pubsub.emulatorHost', type: 'string' as const },
  { env: 'PUBSUB_USE_EMULATOR', path: 'pubsub.useEmulator', type: 'boolean' as const },
  
  // 监控配置
  { env: 'METRICS_PORT', path: 'monitoring.prometheus.port', type: 'number' as const },
  { env: 'METRICS_ENABLED', path: 'monitoring.enableMetrics', type: 'boolean' as const },
  
  // WebSocket配置
  { env: 'WEBSOCKET_PORT', path: 'websocket.port', type: 'number' as const },
  { env: 'WEBSOCKET_ENABLED', path: 'websocket.enabled', type: 'boolean' as const },
] as const;

/**
 * 默认配置值
 */
export const DEFAULT_CONFIG_VALUES = {
  // 服务配置
  service: {
    name: 'pixiu-service',
    version: '1.0.0',
    environment: 'development' as const,
    server: {
      port: DEFAULT_PORTS.SERVICE,
      host: '0.0.0.0',
      enableCors: true,
      timeout: 30000,
    },
  },
  
  // 日志配置
  logging: {
    level: 'info' as const,
    format: 'json' as const,
    output: 'console' as const,
  },
  
  // 监控配置
  monitoring: {
    enableMetrics: true,
    enableHealthCheck: true,
    metricsInterval: 30000,
    healthCheckInterval: 30000,
    statsReportInterval: 30000,
    verboseStats: false,
    showZeroValues: false,
    prometheus: {
      enabled: true,
      port: DEFAULT_PORTS.METRICS,
      path: '/metrics',
    },
  },
  
  // WebSocket配置
  websocket: {
    enabled: true,
    port: DEFAULT_PORTS.WEBSOCKET_PROXY,
    maxConnections: 1000,
    messageBuffer: 10000,
    enableHeartbeat: true,
    heartbeatInterval: 30000,
  },
  
  // Pub/Sub配置
  pubsub: {
    projectId: 'pixiu-trading-dev',
    useEmulator: false,
    topicPrefix: 'market-data',
    publishSettings: {
      enableBatching: true,
      batchSize: 100,
      batchTimeout: 1000,
      enableMessageOrdering: false,
      retrySettings: {
        maxRetries: 3,
        initialRetryDelay: 1000,
        maxRetryDelay: 60000,
      },
    },
  },
  
  // 数据流配置
  dataflow: {
    bufferSize: 1000,
    batchSize: 100,
    flushInterval: 1000,
    enableCompression: false,
    enableMessageOrdering: false,
    performance: {
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      gcThreshold: 0.8,
      enableOptimization: true,
    },
  },
} as const;

/**
 * 配置验证规则
 */
export const CONFIG_VALIDATION_RULES = {
  // 端口范围验证
  portRange: { min: 1024, max: 65535 },
  
  // 环境验证
  validEnvironments: ['development', 'test', 'staging', 'production'] as const,
  
  // 日志级别验证
  validLogLevels: ['error', 'warn', 'info', 'debug', 'silly'] as const,
  
  // 日志格式验证
  validLogFormats: ['json', 'simple', 'combined'] as const,
  
  // 内存使用限制（字节）
  memoryLimits: {
    min: 64 * 1024 * 1024,   // 64MB
    max: 8 * 1024 * 1024 * 1024, // 8GB
    recommended: 512 * 1024 * 1024, // 512MB
  },
} as const;

/**
 * 环境相关的配置覆盖
 */
export const ENVIRONMENT_OVERRIDES = {
  development: {
    logging: { level: 'debug' },
    monitoring: { verboseStats: true },
    pubsub: { useEmulator: true },
  },
  
  test: {
    logging: { level: 'error', output: 'console' },
    monitoring: { enableMetrics: false },
    pubsub: { useEmulator: true },
    service: { server: { port: DEFAULT_PORTS.SERVICE + DEFAULT_PORTS.TEST_OFFSET } },
  },
  
  production: {
    logging: { level: 'info', format: 'json' },
    monitoring: { enableMetrics: true, verboseStats: false },
    pubsub: { useEmulator: false },
    dataflow: { enableCompression: true },
  },
} as const;

/**
 * 配置路径工具函数
 */
export const CONFIG_PATHS = {
  /**
   * 获取嵌套配置值
   */
  getValue<T = any>(obj: any, path: string): T | undefined {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  },
  
  /**
   * 设置嵌套配置值
   */
  setValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  },
  
  /**
   * 检查配置路径是否存在
   */
  hasPath(obj: any, path: string): boolean {
    return this.getValue(obj, path) !== undefined;
  },
} as const;

/**
 * 类型定义
 */
export type Environment = typeof CONFIG_VALIDATION_RULES.validEnvironments[number];
export type ConfigLogLevel = typeof CONFIG_VALIDATION_RULES.validLogLevels[number];
export type LogFormat = typeof CONFIG_VALIDATION_RULES.validLogFormats[number];
export type EnvMapping = typeof ENV_MAPPINGS[number];
export type ConfigPath = EnvMapping['path'];