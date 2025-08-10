/**
 * Binance流管理功能测试套件
 * 测试BinanceConnectionManager的流管理和批量操作功能
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor } from '../../helpers/test-helpers';

describe('BinanceConnectionManager - 流管理功能', () => {
  let connectionManager: BinanceConnectionManager;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let mockWebSocketClass: typeof MockWebSocket;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    mockWebSocketClass = createMockWebSocket({
      connectDelay: 50,
      autoRespondToPing: true,
      messageDelay: 10
    });
    (global as any).WebSocket = mockWebSocketClass;
  });

  afterAll(() => {
    (global as any).WebSocket = originalWebSocket;
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    connectionManager = new BinanceConnectionManager();
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.destroy();
    }
    eventHelper.cleanup();
    perfMonitor.clear();
  });

  describe('单流管理', () => {
    
    it('应该支持添加单个流', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false // 禁用自动管理便于测试
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 监听流添加事件
      const streamAddedPromise = eventHelper.waitForEvent(connectionManager, 'streamAdded', 5000);
      
      perfMonitor.startTiming('add_stream');
      
      // 添加流
      const streamName = 'btcusdt@ticker';
      await connectionManager.addStream(streamName);
      
      const addStreamTime = perfMonitor.endTiming('add_stream');
      
      // 等待事件
      const addedEvent = await streamAddedPromise;
      expect(addedEvent).toBe(streamName);
      
      // 验证流已添加
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).toContain(streamName);
      expect(activeStreams.length).toBe(1);
      
      // 验证指标
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.activeStreams).toBe(1);
      expect(metrics.streamOperations.additions).toBe(1);
      expect(metrics.streamChanges).toBe(1);
      
      console.log(`✅ 添加单个流成功，耗时: ${addStreamTime}ms`);
    });

    it('应该支持移除单个流', async () => {
      const streamName = 'ethusdt@ticker';
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [streamName],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证流存在
      expect(connectionManager.getActiveStreams()).toContain(streamName);
      
      // 监听流移除事件
      const streamRemovedPromise = eventHelper.waitForEvent(connectionManager, 'streamRemoved', 5000);
      
      perfMonitor.startTiming('remove_stream');
      
      // 移除流
      await connectionManager.removeStream(streamName);
      
      const removeStreamTime = perfMonitor.endTiming('remove_stream');
      
      // 等待事件
      const removedEvent = await streamRemovedPromise;
      expect(removedEvent).toBe(streamName);
      
      // 验证流已移除
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams).not.toContain(streamName);
      expect(activeStreams.length).toBe(0);
      
      // 验证指标
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.activeStreams).toBe(0);
      expect(metrics.streamOperations.removals).toBe(1);
      
      console.log(`✅ 移除单个流成功，耗时: ${removeStreamTime}ms`);
    });

    it('应该正确处理重复添加流', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      const streamName = 'adausdt@ticker';
      
      // 第一次添加
      await connectionManager.addStream(streamName);
      expect(connectionManager.getActiveStreams()).toContain(streamName);
      
      const initialMetrics = connectionManager.getBinanceMetrics();
      const initialAdditions = initialMetrics.streamOperations.additions;
      
      // 第二次添加同一个流
      await connectionManager.addStream(streamName);
      
      // 验证流仍然只有一个
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams.filter(s => s === streamName)).toHaveLength(1);
      
      // 验证添加操作计数没有增加
      const finalMetrics = connectionManager.getBinanceMetrics();
      expect(finalMetrics.streamOperations.additions).toBe(initialAdditions);
      
      console.log('✅ 重复添加流正确处理');
    });

    it('应该正确处理移除不存在的流', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      await connectionManager.connect(config);
      
      const nonExistentStream = 'nonexistent@ticker';
      const initialMetrics = connectionManager.getBinanceMetrics();
      const initialRemovals = initialMetrics.streamOperations.removals;
      
      // 尝试移除不存在的流
      await connectionManager.removeStream(nonExistentStream);
      
      // 验证移除操作计数没有增加
      const finalMetrics = connectionManager.getBinanceMetrics();
      expect(finalMetrics.streamOperations.removals).toBe(initialRemovals);
      
      console.log('✅ 移除不存在的流正确处理');
    });
  });

  describe('批量流管理', () => {
    
    it('应该支持批量添加多个流', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      const streams = TestConfigGenerator.generateStreamNames(10);
      
      // 收集流添加事件
      const eventCollector = eventHelper.createEventCollector(connectionManager, ['streamAdded']);
      
      perfMonitor.startTiming('batch_add_streams');
      
      // 批量添加流
      const addPromises = streams.map(stream => connectionManager.addStream(stream));
      await Promise.all(addPromises);
      
      const batchAddTime = perfMonitor.endTiming('batch_add_streams');
      
      // 等待所有事件
      await testUtils.waitFor(() => eventCollector.getEventCount('streamAdded') === streams.length, 5000);
      
      // 验证所有流都已添加
      const activeStreams = connectionManager.getActiveStreams();
      for (const stream of streams) {
        expect(activeStreams).toContain(stream);
      }
      expect(activeStreams.length).toBe(streams.length);
      
      // 验证指标
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.activeStreams).toBe(streams.length);
      expect(metrics.streamOperations.additions).toBe(streams.length);
      
      console.log(`✅ 批量添加${streams.length}个流成功，耗时: ${batchAddTime}ms`);
      
      eventCollector.stop();
    });

    it('应该支持自动批量流操作调度', async () => {
      const batchDelay = 200; // 200ms批量延迟
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: true,
            batchDelay
          }
        }
      });
      
      await connectionManager.connect(config);
      
      const streams = ['btcusdt@ticker', 'ethusdt@ticker', 'adausdt@ticker'];
      
      // 监听重连事件（批量操作会触发重连）
      const reconnectPromise = eventHelper.waitForEvent(connectionManager, 'reconnected', 10000);
      
      perfMonitor.startTiming('auto_batch_scheduling');
      
      // 快速添加多个流
      for (const stream of streams) {
        await connectionManager.addStream(stream);
      }
      
      // 等待批量操作完成（通过重连事件确认）
      await reconnectPromise;
      
      const batchTime = perfMonitor.endTiming('auto_batch_scheduling');
      
      // 验证所有流都已添加
      const activeStreams = connectionManager.getActiveStreams();
      for (const stream of streams) {
        expect(activeStreams).toContain(stream);
      }
      
      // 验证指标
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.streamOperations.modifications).toBeGreaterThan(0);
      expect(metrics.reconnectCount).toBeGreaterThan(0);
      
      // 验证批量调度时间合理
      expect(batchTime).toBeGreaterThan(batchDelay - 50); // 至少批量延迟时间
      
      console.log(`✅ 自动批量调度完成，耗时: ${batchTime}ms`);
    });

    it('应该正确处理流数量限制', async () => {
      const maxStreams = 5;
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false,
            maxStreams
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 添加到达限制的流
      const streams = TestConfigGenerator.generateStreamNames(maxStreams);
      for (const stream of streams) {
        await connectionManager.addStream(stream);
      }
      
      expect(connectionManager.getActiveStreams()).toHaveLength(maxStreams);
      
      // 尝试添加超出限制的流
      const extraStream = 'extra@ticker';
      await expect(connectionManager.addStream(extraStream)).rejects.toThrow(/limit.*reached/i);
      
      // 验证流数量没有增加
      expect(connectionManager.getActiveStreams()).toHaveLength(maxStreams);
      expect(connectionManager.getActiveStreams()).not.toContain(extraStream);
      
      console.log(`✅ 流数量限制 (${maxStreams}) 正确执行`);
    });
  });

  describe('组合流URL构建', () => {
    
    it('应该为空流列表构建基础URL', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream.binance.com:9443',
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证URL构建
      const actualConfig = connectionManager.getConfig();
      expect(actualConfig.url).toBe('wss://stream.binance.com:9443/ws');
      
      console.log(`✅ 空流列表URL构建: ${actualConfig.url}`);
    });

    it('应该为单个流构建单流URL', async () => {
      const stream = 'btcusdt@ticker';
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream.binance.com:9443',
        binance: {
          combinedStream: {
            streams: [stream],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证单流URL
      const actualConfig = connectionManager.getConfig();
      expect(actualConfig.url).toBe(`wss://stream.binance.com:9443/ws/${stream}`);
      
      console.log(`✅ 单流URL构建: ${actualConfig.url}`);
    });

    it('应该为多个流构建组合流URL', async () => {
      const streams = ['btcusdt@ticker', 'ethusdt@ticker', 'adausdt@depth'];
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream.binance.com:9443',
        binance: {
          combinedStream: {
            streams,
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证组合流URL
      const actualConfig = connectionManager.getConfig();
      const expectedUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
      expect(actualConfig.url).toBe(expectedUrl);
      
      console.log(`✅ 组合流URL构建: ${actualConfig.url}`);
    });

    it('应该正确处理URL中的现有路径', async () => {
      const streams = ['btcusdt@ticker', 'ethusdt@ticker'];
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        url: 'wss://stream.binance.com:9443/ws/existing', // 包含现有路径
        binance: {
          combinedStream: {
            streams,
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 验证URL清理和重构
      const actualConfig = connectionManager.getConfig();
      const expectedUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
      expect(actualConfig.url).toBe(expectedUrl);
      
      console.log(`✅ URL路径清理和重构: ${actualConfig.url}`);
    });
  });

  describe('流操作与重连集成', () => {
    
    it('应该在流变更时自动重连', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: ['btcusdt@ticker'],
            autoManage: true,
            batchDelay: 100
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 监听重连相关事件
      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'reconnecting',
        'reconnected',
        'streamAdded'
      ]);
      
      const initialReconnectCount = connectionManager.getBinanceMetrics().reconnectCount;
      
      // 添加新流触发重连
      await connectionManager.addStream('ethusdt@ticker');
      
      // 等待重连完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnected') > 0, 10000);
      
      // 验证重连发生
      const finalReconnectCount = connectionManager.getBinanceMetrics().reconnectCount;
      expect(finalReconnectCount).toBeGreaterThan(initialReconnectCount);
      
      // 验证流已添加
      expect(connectionManager.getActiveStreams()).toContain('ethusdt@ticker');
      
      // 验证连接状态正常
      expect(connectionManager.isConnected()).toBe(true);
      
      console.log('✅ 流变更触发自动重连成功');
      
      eventCollector.stop();
    });

    it('应该在重连后保持流状态', async () => {
      const initialStreams = ['btcusdt@ticker', 'ethusdt@ticker'];
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [...initialStreams],
            autoManage: false
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 添加额外的流
      const newStream = 'adausdt@ticker';
      await connectionManager.addStream(newStream);
      
      const expectedStreams = [...initialStreams, newStream];
      expect(connectionManager.getActiveStreams()).toEqual(expect.arrayContaining(expectedStreams));
      
      // 手动触发重连
      const reconnectedPromise = eventHelper.waitForEvent(connectionManager, 'reconnected', 10000);
      await connectionManager.reconnect();
      await reconnectedPromise;
      
      // 验证重连后流状态保持
      const streamsAfterReconnect = connectionManager.getActiveStreams();
      expect(streamsAfterReconnect).toEqual(expect.arrayContaining(expectedStreams));
      expect(streamsAfterReconnect.length).toBe(expectedStreams.length);
      
      console.log('✅ 重连后流状态保持正确');
    });

    it('应该正确处理重连期间的流操作', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: ['btcusdt@ticker'],
            autoManage: true,
            batchDelay: 500 // 较长的批量延迟
          }
        }
      });
      
      await connectionManager.connect(config);
      
      // 监听重连事件
      const reconnectingPromise = eventHelper.waitForEvent(connectionManager, 'reconnecting', 5000);
      
      // 快速添加多个流
      const newStreams = ['ethusdt@ticker', 'adausdt@ticker', 'bnbusdt@ticker'];
      const addPromises = newStreams.map(stream => connectionManager.addStream(stream));
      
      // 在操作期间手动触发重连
      setTimeout(() => {
        connectionManager.reconnect().catch(() => {});
      }, 100);
      
      // 等待所有添加操作完成
      await Promise.allSettled(addPromises);
      
      // 等待重连完成
      await reconnectingPromise;
      await eventHelper.waitForEvent(connectionManager, 'reconnected', 10000);
      
      // 验证最终状态
      const finalStreams = connectionManager.getActiveStreams();
      expect(finalStreams.length).toBeGreaterThan(1); // 至少保留初始流
      
      // 验证连接正常
      expect(connectionManager.isConnected()).toBe(true);
      
      console.log('✅ 重连期间流操作处理正确');
    });
  });

  describe('流操作性能测试', () => {
    
    it('应该在合理时间内处理大量流添加', async () => {
      const streamCount = 100;
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false,
            maxStreams: streamCount * 2
          }
        }
      });
      
      await connectionManager.connect(config);
      
      const streams = TestConfigGenerator.generateStreamNames(streamCount);
      
      perfMonitor.startTiming('large_batch_add');
      
      // 批量添加大量流
      const addPromises = streams.map(stream => {
        perfMonitor.startTiming(`add_${stream}`);
        return connectionManager.addStream(stream).then(() => {
          perfMonitor.endTiming(`add_${stream}`);
        });
      });
      
      await Promise.all(addPromises);
      
      const totalTime = perfMonitor.endTiming('large_batch_add');
      
      // 验证所有流都已添加
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams.length).toBe(streamCount);
      
      // 性能断言
      expect(totalTime).toBeLessThan(10000); // 总时间小于10秒
      
      const avgAddTime = totalTime / streamCount;
      expect(avgAddTime).toBeLessThan(100); // 平均每个流小于100ms
      
      console.log(`✅ 批量添加${streamCount}个流，总耗时: ${totalTime}ms，平均: ${avgAddTime.toFixed(2)}ms/流`);
    });

    it('应该有效处理流的频繁添加和移除', async () => {
      const config = TestConfigGenerator.generateBinanceConnectionManager({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false,
            maxStreams: 50
          }
        }
      });
      
      await connectionManager.connect(config);
      
      const baseStreams = TestConfigGenerator.generateStreamNames(20);
      const operationCount = 100;
      
      // 先添加基础流
      for (const stream of baseStreams) {
        await connectionManager.addStream(stream);
      }
      
      perfMonitor.startTiming('frequent_operations');
      
      // 执行频繁的添加和移除操作
      for (let i = 0; i < operationCount; i++) {
        const stream = `temp${i}@ticker`;
        
        if (Math.random() > 0.5) {
          // 添加临时流
          try {
            await connectionManager.addStream(stream);
            perfMonitor.recordValue('add_operations', 1);
          } catch (error) {
            // 可能触发流数量限制
          }
        } else {
          // 移除随机流
          const activeStreams = connectionManager.getActiveStreams();
          if (activeStreams.length > 0) {
            const randomStream = activeStreams[Math.floor(Math.random() * activeStreams.length)];
            await connectionManager.removeStream(randomStream);
            perfMonitor.recordValue('remove_operations', 1);
          }
        }
      }
      
      const totalTime = perfMonitor.endTiming('frequent_operations');
      
      // 验证连接仍然正常
      expect(connectionManager.isConnected()).toBe(true);
      
      // 验证指标
      const metrics = connectionManager.getBinanceMetrics();
      expect(metrics.streamChanges).toBeGreaterThan(operationCount / 2);
      
      const avgOperationTime = totalTime / operationCount;
      expect(avgOperationTime).toBeLessThan(50); // 平均每个操作小于50ms
      
      console.log(`✅ ${operationCount}次频繁操作，总耗时: ${totalTime}ms，平均: ${avgOperationTime.toFixed(2)}ms/操作`);
    });
  });
});