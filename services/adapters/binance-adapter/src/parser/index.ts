/**
 * Parser Module Exports
 * 
 * 导出所有数据解析器和相关接口
 */

// 接口和类型
export * from './interfaces';

// 数据标准化器
export { DataNormalizer } from './DataNormalizer';

// 具体解析器
export { TradeParser } from './TradeParser';
export { KlineParser } from './KlineParser';
export { TickerParser } from './TickerParser';
export { CombinedStreamParser } from './CombinedStreamParser';

// 便捷的解析器工厂
export { ParserFactory } from './ParserFactory';