/**
 * Binance WebSocket 连接管理器配置管理
 * 
 * 提供默认配置、配置验证和配置加载功能
 */

import {
  ConnectionManagerConfig,
  ConnectionPoolConfig,
  HeartbeatConfig,
  ReconnectConfig,
  MonitoringConfig
} from './interfaces';

/**
 * 默认心跳配置 (严格按照 Binance 官方规范)
 */
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  // 25 秒无 ping 视为异常 (服务器应该每 20 秒发送 ping)
  pingTimeoutThreshold: 25000,
  
  // 可选: 每 15 秒发送主动 pong
  unsolicitedPongInterval: 15000,
  
  // 每 5 秒检查一次心跳健康
  healthCheckInterval: 5000,
  
  // Pong 响应超时 1 秒 (正常应该在几毫秒内完成)
  pongResponseTimeout: 1000
};

/**
 * 默认重连配置
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  // 初始延迟 1 秒
  initialDelay: 1000,
  
  // 最大延迟 30 秒
  maxDelay: 30000,
  
  // 指数退避倍数 2.0
  backoffMultiplier: 2.0,
  
  // 最大重试 50 次
  maxRetries: 50,
  
  // 启用随机抖动
  jitter: true,
  
  // 5 分钟成功连接后重置计数器
  resetAfter: 300000
};

/**
 * 默认连接池配置
 */
export const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  // 最大 5 个连接
  maxConnections: 5,
  
  // 每个连接最多 1000 个流 (低于 Binance 1024 限制)
  maxStreamsPerConnection: 1000,
  
  // 连接超时 30 秒
  connectionTimeout: 30000,
  
  // 空闲超时 5 分钟
  idleTimeout: 300000,
  
  // 每分钟健康检查
  healthCheckInterval: 60000
};

/**
 * 默认监控配置
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  // 每 10 秒更新指标
  metricsInterval: 10000,
  
  // 健康分数阈值 0.7
  healthScoreThreshold: 0.7,
  
  // 健康下降时告警
  alertOnHealthDrop: true,
  
  // 延迟分桶 (毫秒)
  latencyBuckets: [10, 25, 50, 100, 200, 500, 1000, 2000]
};

/**
 * 默认连接管理器配置
 */
export function createDefaultConfig(wsEndpoint?: string): ConnectionManagerConfig {
  return {
    wsEndpoint: wsEndpoint || 'wss://stream.binance.com:9443',
    pool: DEFAULT_POOL_CONFIG,
    heartbeat: DEFAULT_HEARTBEAT_CONFIG,
    reconnect: DEFAULT_RECONNECT_CONFIG,
    monitoring: DEFAULT_MONITORING_CONFIG
  };
}

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 验证心跳配置
 */
export function validateHeartbeatConfig(config: HeartbeatConfig): void {
  if (config.pingTimeoutThreshold < 10000) {
    throw new ConfigValidationError('pingTimeoutThreshold must be at least 10 seconds', 'heartbeat.pingTimeoutThreshold');
  }
  
  if (config.pingTimeoutThreshold > 120000) {
    throw new ConfigValidationError('pingTimeoutThreshold should not exceed 2 minutes', 'heartbeat.pingTimeoutThreshold');
  }
  
  if (config.healthCheckInterval < 1000) {
    throw new ConfigValidationError('healthCheckInterval must be at least 1 second', 'heartbeat.healthCheckInterval');
  }
  
  if (config.pongResponseTimeout < 100) {
    throw new ConfigValidationError('pongResponseTimeout must be at least 100ms', 'heartbeat.pongResponseTimeout');
  }
  
  if (config.unsolicitedPongInterval && config.unsolicitedPongInterval < 1000) {
    throw new ConfigValidationError('unsolicitedPongInterval must be at least 1 second', 'heartbeat.unsolicitedPongInterval');
  }
}

/**
 * 验证重连配置
 */
export function validateReconnectConfig(config: ReconnectConfig): void {
  if (config.initialDelay < 100) {
    throw new ConfigValidationError('initialDelay must be at least 100ms', 'reconnect.initialDelay');
  }
  
  if (config.maxDelay < config.initialDelay) {
    throw new ConfigValidationError('maxDelay must be greater than initialDelay', 'reconnect.maxDelay');
  }
  
  if (config.backoffMultiplier < 1.0) {
    throw new ConfigValidationError('backoffMultiplier must be at least 1.0', 'reconnect.backoffMultiplier');
  }
  
  if (config.backoffMultiplier > 10.0) {
    throw new ConfigValidationError('backoffMultiplier should not exceed 10.0', 'reconnect.backoffMultiplier');
  }
  
  if (config.maxRetries < 1) {
    throw new ConfigValidationError('maxRetries must be at least 1', 'reconnect.maxRetries');
  }
  
  if (config.resetAfter < 60000) {
    throw new ConfigValidationError('resetAfter must be at least 1 minute', 'reconnect.resetAfter');
  }
}

/**
 * 验证连接池配置
 */
export function validatePoolConfig(config: ConnectionPoolConfig): void {
  if (config.maxConnections < 1) {
    throw new ConfigValidationError('maxConnections must be at least 1', 'pool.maxConnections');
  }
  
  if (config.maxConnections > 20) {
    throw new ConfigValidationError('maxConnections should not exceed 20', 'pool.maxConnections');
  }
  
  if (config.maxStreamsPerConnection < 1) {
    throw new ConfigValidationError('maxStreamsPerConnection must be at least 1', 'pool.maxStreamsPerConnection');
  }
  
  if (config.maxStreamsPerConnection > 1024) {
    throw new ConfigValidationError('maxStreamsPerConnection should not exceed 1024 (Binance limit)', 'pool.maxStreamsPerConnection');
  }
  
  if (config.connectionTimeout < 5000) {
    throw new ConfigValidationError('connectionTimeout must be at least 5 seconds', 'pool.connectionTimeout');
  }
  
  if (config.idleTimeout < 60000) {
    throw new ConfigValidationError('idleTimeout must be at least 1 minute', 'pool.idleTimeout');
  }
  
  if (config.healthCheckInterval < 10000) {
    throw new ConfigValidationError('healthCheckInterval must be at least 10 seconds', 'pool.healthCheckInterval');
  }
}

/**
 * 验证监控配置
 */
export function validateMonitoringConfig(config: MonitoringConfig): void {
  if (config.metricsInterval < 1000) {
    throw new ConfigValidationError('metricsInterval must be at least 1 second', 'monitoring.metricsInterval');
  }
  
  if (config.healthScoreThreshold < 0 || config.healthScoreThreshold > 1) {
    throw new ConfigValidationError('healthScoreThreshold must be between 0 and 1', 'monitoring.healthScoreThreshold');
  }
  
  if (config.latencyBuckets.length === 0) {
    throw new ConfigValidationError('latencyBuckets must not be empty', 'monitoring.latencyBuckets');
  }
  
  // 检查延迟分桶是否按升序排列
  for (let i = 1; i < config.latencyBuckets.length; i++) {
    if (config.latencyBuckets[i] <= config.latencyBuckets[i - 1]) {
      throw new ConfigValidationError('latencyBuckets must be in ascending order', 'monitoring.latencyBuckets');
    }
  }
}

/**
 * 验证完整配置
 */
export function validateConfig(config: ConnectionManagerConfig): void {
  // 验证 WebSocket 端点
  if (!config.wsEndpoint) {
    throw new ConfigValidationError('wsEndpoint is required', 'wsEndpoint');
  }
  
  try {
    new URL(config.wsEndpoint);
  } catch {
    throw new ConfigValidationError('wsEndpoint must be a valid URL', 'wsEndpoint');
  }
  
  if (!config.wsEndpoint.startsWith('ws://') && !config.wsEndpoint.startsWith('wss://')) {
    throw new ConfigValidationError('wsEndpoint must be a WebSocket URL (ws:// or wss://)', 'wsEndpoint');
  }
  
  // 验证各个子配置
  validateHeartbeatConfig(config.heartbeat);
  validateReconnectConfig(config.reconnect);
  validatePoolConfig(config.pool);
  validateMonitoringConfig(config.monitoring);
  
  // 跨配置验证
  if (config.heartbeat.healthCheckInterval > config.monitoring.metricsInterval * 2) {
    console.warn('Warning: heartbeat.healthCheckInterval is much larger than monitoring.metricsInterval');
  }
  
  if (config.reconnect.maxDelay < config.heartbeat.pingTimeoutThreshold) {
    console.warn('Warning: reconnect.maxDelay is less than heartbeat.pingTimeoutThreshold');
  }
}

/**
 * 合并配置 (深度合并)
 */
export function mergeConfig(
  baseConfig: ConnectionManagerConfig,
  overrides: Partial<ConnectionManagerConfig>
): ConnectionManagerConfig {
  return {
    wsEndpoint: overrides.wsEndpoint || baseConfig.wsEndpoint,
    pool: { ...baseConfig.pool, ...overrides.pool },
    heartbeat: { ...baseConfig.heartbeat, ...overrides.heartbeat },
    reconnect: { ...baseConfig.reconnect, ...overrides.reconnect },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring }
  };
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): Partial<ConnectionManagerConfig> {
  const config: Partial<ConnectionManagerConfig> = {};
  
  if (process.env.BINANCE_WS_ENDPOINT) {
    config.wsEndpoint = process.env.BINANCE_WS_ENDPOINT;
  }
  
  // 连接池配置
  const poolConfig: Partial<ConnectionPoolConfig> = {};
  if (process.env.BINANCE_MAX_CONNECTIONS) {
    poolConfig.maxConnections = parseInt(process.env.BINANCE_MAX_CONNECTIONS);
  }
  if (process.env.BINANCE_MAX_STREAMS_PER_CONNECTION) {
    poolConfig.maxStreamsPerConnection = parseInt(process.env.BINANCE_MAX_STREAMS_PER_CONNECTION);
  }
  if (process.env.BINANCE_CONNECTION_TIMEOUT) {
    poolConfig.connectionTimeout = parseInt(process.env.BINANCE_CONNECTION_TIMEOUT);
  }
  if (Object.keys(poolConfig).length > 0) {
    config.pool = poolConfig;
  }
  
  // 心跳配置
  const heartbeatConfig: Partial<HeartbeatConfig> = {};
  if (process.env.BINANCE_PING_TIMEOUT_THRESHOLD) {
    heartbeatConfig.pingTimeoutThreshold = parseInt(process.env.BINANCE_PING_TIMEOUT_THRESHOLD);
  }
  if (process.env.BINANCE_UNSOLICITED_PONG_INTERVAL) {
    heartbeatConfig.unsolicitedPongInterval = parseInt(process.env.BINANCE_UNSOLICITED_PONG_INTERVAL);
  }
  if (Object.keys(heartbeatConfig).length > 0) {
    config.heartbeat = heartbeatConfig;
  }
  
  // 重连配置
  const reconnectConfig: Partial<ReconnectConfig> = {};
  if (process.env.BINANCE_RECONNECT_INITIAL_DELAY) {
    reconnectConfig.initialDelay = parseInt(process.env.BINANCE_RECONNECT_INITIAL_DELAY);
  }
  if (process.env.BINANCE_RECONNECT_MAX_DELAY) {
    reconnectConfig.maxDelay = parseInt(process.env.BINANCE_RECONNECT_MAX_DELAY);
  }
  if (process.env.BINANCE_RECONNECT_MAX_RETRIES) {
    reconnectConfig.maxRetries = parseInt(process.env.BINANCE_RECONNECT_MAX_RETRIES);
  }
  if (Object.keys(reconnectConfig).length > 0) {
    config.reconnect = reconnectConfig;
  }
  
  return config;
}

/**
 * 配置预设
 */
export const CONFIG_PRESETS = {
  /**
   * 开发环境配置
   */
  development: (): ConnectionManagerConfig => ({
    ...createDefaultConfig(),
    pool: {
      ...DEFAULT_POOL_CONFIG,
      maxConnections: 2,
      maxStreamsPerConnection: 100
    },
    monitoring: {
      ...DEFAULT_MONITORING_CONFIG,
      metricsInterval: 5000
    }
  }),
  
  /**
   * 测试环境配置
   */
  testing: (): ConnectionManagerConfig => ({
    ...createDefaultConfig(),
    pool: {
      ...DEFAULT_POOL_CONFIG,
      maxConnections: 1,
      maxStreamsPerConnection: 10,
      connectionTimeout: 10000,
      healthCheckInterval: 10000
    },
    heartbeat: {
      ...DEFAULT_HEARTBEAT_CONFIG,
      pingTimeoutThreshold: 15000,
      healthCheckInterval: 2000
    },
    reconnect: {
      ...DEFAULT_RECONNECT_CONFIG,
      initialDelay: 500,
      maxDelay: 5000,
      maxRetries: 3
    }
  }),
  
  /**
   * 生产环境配置 (高性能)
   */
  production: (): ConnectionManagerConfig => ({
    ...createDefaultConfig(),
    pool: {
      ...DEFAULT_POOL_CONFIG,
      maxConnections: 10,
      maxStreamsPerConnection: 1000
    },
    monitoring: {
      ...DEFAULT_MONITORING_CONFIG,
      metricsInterval: 30000
    }
  }),
  
  /**
   * 保守配置 (最大稳定性)
   */
  conservative: (): ConnectionManagerConfig => ({
    ...createDefaultConfig(),
    pool: {
      ...DEFAULT_POOL_CONFIG,
      maxConnections: 3,
      maxStreamsPerConnection: 500,
      healthCheckInterval: 30000
    },
    heartbeat: {
      ...DEFAULT_HEARTBEAT_CONFIG,
      pingTimeoutThreshold: 20000,
      unsolicitedPongInterval: 10000
    },
    reconnect: {
      ...DEFAULT_RECONNECT_CONFIG,
      backoffMultiplier: 1.5,
      maxRetries: 100
    }
  })
};

/**
 * 获取配置预设
 */
export function getConfigPreset(preset: keyof typeof CONFIG_PRESETS): ConnectionManagerConfig {
  return CONFIG_PRESETS[preset]();
}