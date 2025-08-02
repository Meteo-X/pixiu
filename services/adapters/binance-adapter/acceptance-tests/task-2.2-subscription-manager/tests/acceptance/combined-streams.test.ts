/**
 * Acceptance Tests for Combined Streams (Task 2.2)
 * 
 * 验证多流组合订阅（Combined Streams）功能的验收测试
 * 
 * 测试范围:
 * - ✅ 组合流 URL 构建规范符合性
 * - ✅ 多流组合和参数处理
 * - ✅ 流数量限制和验证
 * - ✅ URL 编码和格式化
 * - ✅ 重复流处理和去重
 * - ✅ 错误处理和边界条件
 * - ✅ 性能和可扩展性
 */

import { StreamNameBuilder } from '../../../../../src/subscription/StreamNameBuilder';
import { DataType } from '../../../../../src/types';

describe('Combined Streams - Acceptance Tests', () => {
  let streamBuilder: StreamNameBuilder;

  beforeEach(() => {
    streamBuilder = new StreamNameBuilder();
  });

  describe('AC-2.2.9: 组合流 URL 构建规范', () => {
    it('应该按照 Binance 规范构建基本组合流 URL', () => {
      const streamNames = ['btcusdt@trade', 'ethusdt@trade'];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade');
    });

    it('应该构建包含不同数据类型的组合流 URL', () => {
      const streamNames = [
        'btcusdt@trade',
        'ethusdt@ticker',
        'bnbusdt@kline_1m',
        'adausdt@depth'
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe(
        'wss://stream.binance.com:9443/stream?streams=' +
        'btcusdt@trade/ethusdt@ticker/bnbusdt@kline_1m/adausdt@depth'
      );
    });

    it('应该构建包含复杂参数的组合流 URL', () => {
      const streamNames = [
        'btcusdt@depth5@100ms',
        'ethusdt@kline_5m',
        'bnbusdt@depth10',
        'adausdt@trade'
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe(
        'wss://stream.binance.com:9443/stream?streams=' +
        'btcusdt@depth5@100ms/ethusdt@kline_5m/bnbusdt@depth10/adausdt@trade'
      );
    });
  });

  describe('AC-2.2.10: 流数量管理', () => {
    it('应该支持单个流的组合', () => {
      const streamNames = ['btcusdt@trade'];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade');
    });

    it('应该支持中等数量流的组合', () => {
      const streamNames = Array(100).fill(null).map((_, i) => 
        `symbol${i}usdt@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toContain('stream?streams=');
      expect(url.split('/').length).toBe(streamNames.length + 2); // baseUrl parts + stream parts
    });

    it('应该支持接近最大限制的流数量', () => {
      const maxStreams = 1024;
      const streamNames = Array(maxStreams).fill(null).map((_, i) => 
        `symbol${i}usdt@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      }).not.toThrow();
    });

    it('应该拒绝超过最大限制的流数量', () => {
      const streamNames = Array(2000).fill('btcusdt@trade');
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      }).toThrow('Too many streams: 2000 > 1024');
    });

    it('应该支持自定义最大流数量限制', () => {
      const streamNames = Array(500).fill('btcusdt@trade');
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = { maxStreams: 400 };

      expect(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);
      }).toThrow('Too many streams: 500 > 400');
    });
  });

  describe('AC-2.2.11: 重复流处理', () => {
    it('应该自动去重相同的流名称', () => {
      const streamNames = [
        'btcusdt@trade',
        'ethusdt@trade',
        'btcusdt@trade', // 重复
        'bnbusdt@trade',
        'ethusdt@trade'  // 重复
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe(
        'wss://stream.binance.com:9443/stream?streams=' +
        'btcusdt@trade/ethusdt@trade/bnbusdt@trade'
      );
    });

    it('应该保持去重后的流顺序', () => {
      const streamNames = [
        'adausdt@trade',
        'btcusdt@trade',
        'adausdt@trade', // 重复，应被去除
        'ethusdt@trade',
        'btcusdt@trade'  // 重复，应被去除
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe(
        'wss://stream.binance.com:9443/stream?streams=' +
        'adausdt@trade/btcusdt@trade/ethusdt@trade'
      );
    });

    it('应该正确处理大量重复流', () => {
      const streamNames = Array(1000).fill('btcusdt@trade');
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade');
    });
  });

  describe('AC-2.2.12: URL 编码和格式化', () => {
    it('应该支持 URI 编码选项', () => {
      const streamNames = ['btcusdt@trade', 'ethusdt@ticker'];
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = {
        encoding: { encodeURI: true }
      };

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);

      expect(url).toBe(
        encodeURI('wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@ticker')
      );
    });

    it('应该支持组件编码选项', () => {
      const streamNames = ['btcusdt@trade', 'ethusdt@ticker'];
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = {
        encoding: { encodeComponent: true }
      };

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);

      expect(url).toBe(
        'wss://stream.binance.com:9443/stream?streams=' +
        encodeURIComponent('btcusdt@trade/ethusdt@ticker')
      );
    });

    it('应该处理特殊字符的编码', () => {
      const streamNames = ['btcusdt@depth5@100ms', 'ethusdt@kline_1m'];
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = {
        encoding: { encodeComponent: true }
      };

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);

      expect(url).toContain('stream?streams=');
      expect(url).toContain(encodeURIComponent('btcusdt@depth5@100ms/ethusdt@kline_1m'));
    });

    it('应该正确处理不同基础 URL 格式', () => {
      const streamNames = ['btcusdt@trade'];
      const testCases = [
        'wss://stream.binance.com:9443',
        'wss://stream.binance.com:9443/',
        'ws://localhost:8080',
        'wss://testnet.binance.vision:9443'
      ];

      testCases.forEach(baseUrl => {
        const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
        
        expect(url).toContain('/stream?streams=btcusdt@trade');
        expect(url.startsWith(baseUrl.replace(/\/$/, ''))).toBe(true);
      });
    });
  });

  describe('AC-2.2.13: 错误处理和验证', () => {
    it('应该拒绝空的流名称数组', () => {
      const streamNames: string[] = [];
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      }).toThrow('Stream names array cannot be empty');
    });

    it('应该验证流名称格式', () => {
      const invalidStreamNames = [
        'invalid-stream',
        'btc@',
        '@trade',
        'BTCUSDT@trade', // 大写
        'btcusdt@invalid'
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      invalidStreamNames.forEach(invalidName => {
        const streamNames = ['btcusdt@trade', invalidName];
        
        expect(() => {
          streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
        }).toThrow(`Invalid stream name: ${invalidName}`);
      });
    });

    it('应该处理无效的基础 URL', () => {
      const streamNames = ['btcusdt@trade'];
      const invalidUrls = [
        '',
        null,
        undefined,
        'not-a-url',
        'ftp://invalid.com'
      ];

      invalidUrls.forEach(baseUrl => {
        expect(() => {
          streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl as any);
        }).toThrow();
      });
    });

    it('应该处理混合有效和无效流名称', () => {
      const streamNames = [
        'btcusdt@trade',     // 有效
        'invalid-stream',    // 无效
        'ethusdt@ticker'     // 有效
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      }).toThrow('Invalid stream name: invalid-stream');
    });
  });

  describe('AC-2.2.14: 性能和可扩展性', () => {
    it('应该高效处理中等规模的流组合', () => {
      const streamNames = Array(100).fill(null).map((_, i) => 
        `symbol${i}usdt@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      const { duration } = testUtils.measurePerformance(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      });

      expect(duration).toMeetPerformanceThreshold(5000, 'μs'); // 5ms
    });

    it('应该高效处理大规模的流组合', () => {
      const streamNames = Array(1000).fill(null).map((_, i) => 
        `symbol${i}usdt@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      const { duration } = testUtils.measurePerformance(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      });

      expect(duration).toMeetPerformanceThreshold(50000, 'μs'); // 50ms
    });

    it('应该高效处理重复流的去重操作', () => {
      const streamNames = Array(10000).fill('btcusdt@trade'); // 大量重复
      const baseUrl = 'wss://stream.binance.com:9443';

      const { duration } = testUtils.measurePerformance(() => {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      });

      expect(duration).toMeetPerformanceThreshold(10000, 'μs'); // 10ms
    });

    it('应该控制内存使用量', () => {
      const streamNames = Array(1000).fill(null).map((_, i) => 
        `verylongsymbolname${i}usdt@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      const memBefore = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 100; i++) {
        streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      // 内存增长应该在合理范围内（10MB）
      expect(memDiff).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('AC-2.2.15: 复杂场景测试', () => {
    it('应该处理包含所有数据类型的复杂组合', () => {
      const streamNames = [
        'btcusdt@trade',
        'ethusdt@ticker',
        'bnbusdt@kline_1m',
        'adausdt@kline_5m',
        'dotusdt@kline_1h',
        'linkusdt@depth',
        'ltcusdt@depth5',
        'xrpusdt@depth10@100ms',
        'solusdt@kline_1d'
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      expect(url).toContain('stream?streams=');
      streamNames.forEach(streamName => {
        expect(url).toContain(streamName);
      });
    });

    it('应该处理边界条件的流组合', () => {
      // 测试接近限制的情况
      const streamNames = Array(1023).fill(null).map((_, i) => 
        `s${i}@trade`
      );
      const baseUrl = 'wss://stream.binance.com:9443';

      expect(() => {
        const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);
        expect(url).toContain('stream?streams=');
      }).not.toThrow();
    });

    it('应该正确处理相似但不同的流名称', () => {
      const streamNames = [
        'btcusdt@trade',
        'btcusd@trade',      // 相似但不同
        'btcusdt@ticker',    // 相同符号，不同类型
        'ethusdt@trade'
      ];
      const baseUrl = 'wss://stream.binance.com:9443';

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl);

      // 所有流都应该包含在 URL 中
      streamNames.forEach(streamName => {
        expect(url).toContain(streamName);
      });
    });
  });

  describe('AC-2.2.16: 配置灵活性', () => {
    it('应该支持完整的配置选项', () => {
      const streamNames = ['btcusdt@trade', 'ethusdt@ticker'];
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = {
        maxStreams: 500,
        encoding: {
          encodeURI: false,
          encodeComponent: true
        }
      };

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);

      expect(url).toContain(encodeURIComponent('btcusdt@trade/ethusdt@ticker'));
    });

    it('应该使用默认配置处理未指定的选项', () => {
      const streamNames = ['btcusdt@trade'];
      const baseUrl = 'wss://stream.binance.com:9443';
      const config = {}; // 空配置

      const url = streamBuilder.buildCombinedStreamUrl(streamNames, baseUrl, config);

      expect(url).toBe('wss://stream.binance.com:9443/stream?streams=btcusdt@trade');
    });
  });
});