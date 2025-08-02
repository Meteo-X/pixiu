/**
 * 配置管理核心类型定义
 */

import { Schema } from 'joi';

export interface BaseConfig {
  /** 配置名称 */
  name?: string;
  /** 配置版本 */
  version?: string;
  /** 环境类型 */
  environment?: string;
}

export interface ConfigSource {
  /** 配置来源类型 */
  type: 'file' | 'env' | 'remote' | 'default';
  /** 配置来源路径或标识 */
  source: string;
  /** 优先级（数字越大优先级越高） */
  priority: number;
}

export interface ConfigManagerOptions {
  /** 配置来源列表 */
  sources?: ConfigSource[];
  /** 是否启用配置验证 */
  enableValidation?: boolean;
  /** 是否启用热更新 */
  enableHotReload?: boolean;
  /** 是否启用环境变量覆盖 */
  enableEnvOverride?: boolean;
  /** 配置缓存TTL（毫秒） */
  cacheTtl?: number;
  /** 是否启用配置加密 */
  enableEncryption?: boolean;
}

export interface ConfigValidationRule {
  /** 验证规则名称 */
  name: string;
  /** Joi验证schema */
  schema: Schema;
  /** 错误消息 */
  message?: string;
}

export interface ConfigLoadResult<T = any> {
  /** 配置数据 */
  config: T;
  /** 加载来源 */
  sources: ConfigSource[];
  /** 加载时间戳 */
  timestamp: number;
  /** 是否有验证错误 */
  hasValidationErrors: boolean;
  /** 验证错误列表 */
  validationErrors?: string[];
}

export interface ConfigUpdateEvent<T = any> {
  /** 事件类型 */
  type: 'loaded' | 'updated' | 'error' | 'validation_failed';
  /** 配置数据 */
  config?: T;
  /** 错误信息 */
  error?: Error;
  /** 事件时间戳 */
  timestamp: number;
}

export type ConfigValidator<T = any> = (config: T) => boolean | string | string[];

export type ConfigTransformer<T = any> = (config: any) => T;

export type ConfigEventHandler<T = any> = (event: ConfigUpdateEvent<T>) => void;