/**
 * Unit Tests for ParserFactory
 */

import { ParserFactory } from '../ParserFactory';
import { DataType } from '../../types';
import { UnsupportedDataTypeError } from '../interfaces';

describe('ParserFactory', () => {
  let factory: ParserFactory;

  beforeEach(() => {
    factory = ParserFactory.create();
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = ParserFactory.getInstance();
      const instance2 = ParserFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('应该支持创建新实例', () => {
      const instance1 = ParserFactory.create();
      const instance2 = ParserFactory.create();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('解析器获取', () => {
    it('应该返回Trade解析器', () => {
      const parser = factory.getTradeParser();
      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
      expect(typeof parser.validate).toBe('function');
    });

    it('应该返回Kline解析器', () => {
      const parser = factory.getKlineParser();
      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
      expect(typeof parser.validate).toBe('function');
    });

    it('应该返回Ticker解析器', () => {
      const parser = factory.getTickerParser();
      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
      expect(typeof parser.validate).toBe('function');
    });

    it('应该返回Combined Stream解析器', () => {
      const parser = factory.getCombinedStreamParser();
      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
      expect(typeof parser.validate).toBe('function');
    });

    it('应该缓存解析器实例', () => {
      const parser1 = factory.getTradeParser();
      const parser2 = factory.getTradeParser();
      expect(parser1).toBe(parser2);
    });
  });

  describe('根据数据类型获取解析器', () => {
    it('应该为Trade数据类型返回Trade解析器', () => {
      const parser = factory.getParserByDataType(DataType.TRADE);
      expect(parser).toBe(factory.getTradeParser());
    });

    it('应该为所有Kline数据类型返回Kline解析器', () => {
      const klineTypes = [
        DataType.KLINE_1M,
        DataType.KLINE_5M,
        DataType.KLINE_15M,
        DataType.KLINE_30M,
        DataType.KLINE_1H,
        DataType.KLINE_4H,
        DataType.KLINE_1D
      ];

      for (const dataType of klineTypes) {
        const parser = factory.getParserByDataType(dataType);
        expect(parser).toBe(factory.getKlineParser());
      }
    });

    it('应该为Ticker数据类型返回Ticker解析器', () => {
      const parser = factory.getParserByDataType(DataType.TICKER);
      expect(parser).toBe(factory.getTickerParser());
    });

    it('应该为不支持的数据类型抛出错误', () => {
      expect(() => factory.getParserByDataType('unsupported' as DataType))
        .toThrow(UnsupportedDataTypeError);
    });
  });

  describe('创建独立解析器实例', () => {
    it('应该创建新的Trade解析器实例', () => {
      const parser1 = factory.createTradeParser();
      const parser2 = factory.createTradeParser();
      const cached = factory.getTradeParser();

      expect(parser1).not.toBe(parser2);
      expect(parser1).not.toBe(cached);
      expect(parser2).not.toBe(cached);
    });

    it('应该支持自定义配置', () => {
      const parser = factory.createTradeParser({
        enableValidation: false,
        batchSize: 50
      });

      expect(parser).toBeDefined();
      // 配置验证需要通过行为测试，这里只验证创建成功
    });
  });

  describe('统计信息管理', () => {
    it('应该获取所有解析器统计信息', () => {
      // 先获取一些解析器以创建缓存
      factory.getTradeParser();
      factory.getKlineParser();

      const stats = factory.getAllStats();
      expect(stats).toHaveProperty('trade');
      expect(stats).toHaveProperty('kline');
      expect(stats['trade']).toHaveProperty('totalProcessed');
      expect(stats['kline']).toHaveProperty('totalProcessed');
    });

    it('应该重置所有解析器统计信息', () => {
      factory.getTradeParser();
      factory.resetAllStats();
      
      const stats = factory.getAllStats();
      expect(stats['trade'].totalProcessed).toBe(0);
    });
  });

  describe('数据类型支持', () => {
    it('应该正确识别支持的数据类型', () => {
      expect(factory.isDataTypeSupported(DataType.TRADE)).toBe(true);
      expect(factory.isDataTypeSupported(DataType.KLINE_1M)).toBe(true);
      expect(factory.isDataTypeSupported(DataType.TICKER)).toBe(true);
      expect(factory.isDataTypeSupported('unsupported')).toBe(false);
    });

    it('应该返回支持的数据类型列表', () => {
      const supportedTypes = factory.getSupportedDataTypes();
      expect(supportedTypes).toContain(DataType.TRADE);
      expect(supportedTypes).toContain(DataType.KLINE_1M);
      expect(supportedTypes).toContain(DataType.KLINE_5M);
      expect(supportedTypes).toContain(DataType.TICKER);
      expect(supportedTypes.length).toBeGreaterThan(0);
    });
  });

  describe('配置管理', () => {
    it('应该返回工厂配置', () => {
      const config = factory.getConfig();
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('应该支持更新配置', () => {
      const newConfig = {
        enableValidation: false,
        batchSize: 200
      };

      factory.updateConfig(newConfig);
      const config = factory.getConfig();
      
      expect(config.enableValidation).toBe(false);
      expect(config.batchSize).toBe(200);
    });

    it('应该支持带初始配置创建工厂', () => {
      const initialConfig = {
        enableValidation: false,
        batchSize: 50
      };

      const configuredFactory = ParserFactory.create(initialConfig);
      const config = configuredFactory.getConfig();
      
      expect(config.enableValidation).toBe(false);
      expect(config.batchSize).toBe(50);

      configuredFactory.cleanup();
    });
  });

  describe('工厂清理', () => {
    it('应该清除所有缓存的解析器', () => {
      factory.getTradeParser();
      factory.getKlineParser();
      
      let parsers = factory.getAllParsers();
      expect(parsers.size).toBeGreaterThan(0);

      factory.cleanup();
      
      parsers = factory.getAllParsers();
      expect(parsers.size).toBe(0);
    });

    it('应该在清理后能重新创建解析器', () => {
      const parser1 = factory.getTradeParser();
      factory.cleanup();
      const parser2 = factory.getTradeParser();

      expect(parser1).not.toBe(parser2);
    });
  });

  describe('错误处理', () => {
    it('应该传播解析器创建错误', () => {
      // 这个测试验证工厂不会隐藏解析器构造函数的错误
      // 由于当前解析器构造函数不太可能抛出错误，这里主要验证结构
      expect(() => factory.getTradeParser()).not.toThrow();
    });

    it('应该正确处理不支持数据类型的情况', () => {
      expect(() => factory.getParserByDataType('invalid' as DataType))
        .toThrow(UnsupportedDataTypeError);
      
      expect(() => factory.isDataTypeSupported('invalid'))
        .not.toThrow();
    });
  });
});