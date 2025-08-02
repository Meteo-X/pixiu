/**
 * Pixiu Adapter Base Framework
 * 交易适配器基础框架
 */

// 接口定义
export * from './interfaces/adapter';
export * from './interfaces/connection';
export * from './interfaces/parser';

// 基础实现
export * from './base/adapter';
export * from './base/connection';

// 工厂模式
export * from './factory/adapter-factory';

// 版本信息
export const VERSION = '1.0.0';