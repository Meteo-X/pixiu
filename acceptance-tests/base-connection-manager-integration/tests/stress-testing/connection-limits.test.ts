/**
 * 连接限制和边界测试套件
 * 测试系统在极限条件下的表现和稳定性
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket, WebSocketMockFactory } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor, MemoryMonitor } from '../../helpers/test-helpers';

describe('连接限制和边界测试', () => {
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let memoryMonitor: MemoryMonitor;
  let mockFactory: WebSocketMockFactory;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    mockFactory = new WebSocketMockFactory();
    
    mockFactory.setDefaultOptions({
      connectDelay: 50,
      autoRespondToPing: true,
      messageDelay: 5
    });
  });

  afterAll(() => {
    (global as any).WebSocket = originalWebSocket;
    if (globalCache && typeof globalCache.destroy === 'function') {
      globalCache.destroy();
    }
  });

  beforeEach(() => {
    eventHelper = new EventListenerHelper();
    perfMonitor = new PerformanceMonitor();
    memoryMonitor = new MemoryMonitor();
    
    memoryMonitor.recordBaseline();
    mockFactory.cleanup();
  });

  afterEach(() => {
    eventHelper.cleanup();
    perfMonitor.clear();
    memoryMonitor.clear();
    mockFactory.cleanup();
  });

  describe('最大连接数测试', () => {
    
    it('应该支持大量并发连接', async () => {
      const maxConnections = 100;
      const connectionManagers: BinanceConnectionManager[] = [];
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 20,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      perfMonitor.startTiming('max_connections_test');

      try {
        // 创建大量连接管理器
        const createPromises = Array.from({ length: maxConnections }, async (_, index) => {
          const cm = new BinanceConnectionManager();
          connectionManagers.push(cm);
          
          const config = TestConfigGenerator.generateBinanceConnectionConfig({
            url: `wss://stream.binance.com:9443/ws?conn=${index}`
          });
          
          perfMonitor.startTiming(`connection_${index}`);
          
          try {
            await cm.connect(config);
            perfMonitor.endTiming(`connection_${index}`);
            return { index, success: true, manager: cm };
          } catch (error) {
            perfMonitor.endTiming(`connection_${index}`);
            return { index, success: false, error: error.message, manager: cm };
          }
        });

        // 批量处理连接（避免一次性创建太多Promise）
        const batchSize = 20;
        const results: any[] = [];
        
        for (let i = 0; i < createPromises.length; i += batchSize) {
          const batch = createPromises.slice(i, i + batchSize);
          const batchResults = await Promise.all(batch);
          results.push(...batchResults);
          
          // 短暂等待避免系统过载
          await testUtils.delay(100);
        }

        const maxConnectionTime = perfMonitor.endTiming('max_connections_test');

        // 统计结果
        const successfulConnections = results.filter(r => r.success).length;
        const failedConnections = results.filter(r => !r.success).length;
        const successRate = (successfulConnections / maxConnections) * 100;

        // 计算连接时间统计
        const connectionTimes = results
          .filter(r => r.success)
          .map(r => {
            const stats = perfMonitor.getStats(`connection_${r.index}`);
            return stats?.avg || 0;
          })
          .filter(time => time > 0);

        const avgConnectionTime = connectionTimes.length > 0 
          ? connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length 
          : 0;

        const maxSingleConnectionTime = Math.max(...connectionTimes);

        // 内存使用检查
        const memoryCheck = memoryMonitor.checkForMemoryLeaks(50 * 1024 * 1024); // 50MB阈值

        console.log(`✅ 最大连接数测试完成`);
        console.log(`   目标连接数: ${maxConnections}`);
        console.log(`   成功连接数: ${successfulConnections}`);
        console.log(`   失败连接数: ${failedConnections}`);
        console.log(`   成功率: ${successRate.toFixed(1)}%`);
        console.log(`   总测试时间: ${maxConnectionTime}ms`);
        console.log(`   平均连接时间: ${avgConnectionTime.toFixed(2)}ms`);
        console.log(`   最长连接时间: ${maxSingleConnectionTime}ms`);
        console.log(`   内存增长: ${(memoryCheck.totalGrowth / 1024 / 1024).toFixed(2)}MB`);

        // 性能断言
        expect(successRate).toBeGreaterThan(80); // 至少80%成功率
        expect(avgConnectionTime).toBeLessThan(1000); // 平均连接时间小于1秒
        expect(memoryCheck.hasLeak).toBe(false); // 无明显内存泄漏

        // 验证连接质量
        const connectedManagers = results
          .filter(r => r.success)
          .map(r => r.manager as BinanceConnectionManager);

        for (const cm of connectedManagers.slice(0, 10)) { // 抽样检查前10个
          expect(cm.isConnected()).toBe(true);
          expect(cm.getState()).toBe(ConnectionState.CONNECTED);
        }

      } finally {
        // 清理所有连接
        const cleanupPromises = connectionManagers.map(async (cm, index) => {
          try {
            perfMonitor.startTiming(`cleanup_${index}`);
            await cm.destroy();
            perfMonitor.endTiming(`cleanup_${index}`);
          } catch (error) {
            console.warn(`清理连接${index}失败:`, error.message);
          }
        });

        // 批量清理
        for (let i = 0; i < cleanupPromises.length; i += batchSize) {
          const batch = cleanupPromises.slice(i, i + batchSize);
          await Promise.allSettled(batch);
          await testUtils.delay(50);
        }
      }
    });

    it('应该正确处理连接数超限情况', async () => {
      const connectionLimit = 10;
      const attemptedConnections = 15; // 超过限制的连接数
      const connectionManagers: BinanceConnectionManager[] = [];

      // 模拟有连接限制的WebSocket
      let connectionCount = 0;
      const limitedMockClass = createMockWebSocket({
        get shouldFail() {
          return connectionCount >= connectionLimit;
        },
        connectDelay: 100,
        errorMessage: 'Connection limit exceeded'
      });
      (global as any).WebSocket = limitedMockClass;

      perfMonitor.startTiming('connection_limit_test');

      try {
        const connectionPromises = Array.from({ length: attemptedConnections }, async (_, index) => {
          const cm = new BinanceConnectionManager();
          connectionManagers.push(cm);
          
          const config = TestConfigGenerator.generateBinanceConnectionConfig({
            url: `wss://stream.binance.com:9443/ws?limit=${index}`
          });

          try {
            connectionCount++;
            await cm.connect(config);
            return { index, success: true, manager: cm };
          } catch (error) {
            return { index, success: false, error: error.message, manager: cm };
          }
        });

        const results = await Promise.all(connectionPromises);
        
        const limitTime = perfMonitor.endTiming('connection_limit_test');

        const successfulConnections = results.filter(r => r.success).length;
        const failedConnections = results.filter(r => !r.success).length;

        console.log(`✅ 连接限制测试完成，时间: ${limitTime}ms`);
        console.log(`   连接限制: ${connectionLimit}`);
        console.log(`   尝试连接数: ${attemptedConnections}`);
        console.log(`   成功连接数: ${successfulConnections}`);
        console.log(`   失败连接数: ${failedConnections}`);

        // 验证限制生效
        expect(successfulConnections).toBeLessThanOrEqual(connectionLimit);
        expect(failedConnections).toBeGreaterThan(0);
        expect(successfulConnections + failedConnections).toBe(attemptedConnections);

      } finally {
        // 清理连接
        for (const cm of connectionManagers) {
          await cm.destroy();
        }
      }
    });

    it('应该在连接数动态变化时保持稳定', async () => {
      const maxConcurrent = 50;
      const operationCycles = 5;
      const connectionManagers: BinanceConnectionManager[] = [];
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 30,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      const eventCollector = eventHelper.createEventCollector(
        new BinanceConnectionManager(), // 用于事件类型，实际不使用
        ['connected', 'disconnected', 'error']
      );

      perfMonitor.startTiming('dynamic_connection_test');

      try {
        for (let cycle = 0; cycle < operationCycles; cycle++) {
          console.log(`开始周期 ${cycle + 1}/${operationCycles}`);
          
          // 创建连接
          const createPromises = Array.from({ length: maxConcurrent }, async (_, index) => {
            const cm = new BinanceConnectionManager();
            
            // 监听事件
            eventHelper.addListener(cm, 'connected', () => {
              eventCollector.events.push({ event: 'connected', data: null, timestamp: Date.now() });
            });
            eventHelper.addListener(cm, 'disconnected', (reason) => {
              eventCollector.events.push({ event: 'disconnected', data: reason, timestamp: Date.now() });
            });
            eventHelper.addListener(cm, 'error', (error) => {
              eventCollector.events.push({ event: 'error', data: error.message, timestamp: Date.now() });
            });

            connectionManagers.push(cm);
            
            const config = TestConfigGenerator.generateBinanceConnectionConfig({
              url: `wss://stream.binance.com:9443/ws?cycle=${cycle}&conn=${index}`
            });
            
            await cm.connect(config);
            return cm;
          });

          await Promise.all(createPromises);
          
          // 验证连接状态
          const connectedCount = connectionManagers.filter(cm => cm.isConnected()).length;
          expect(connectedCount).toBe(maxConcurrent);

          await testUtils.delay(500); // 保持连接一段时间

          // 断开所有连接
          const disconnectPromises = connectionManagers.map(cm => cm.destroy());
          await Promise.all(disconnectPromises);
          
          connectionManagers.length = 0; // 清空数组
          
          await testUtils.delay(300); // 等待清理完成
        }

        const dynamicTime = perfMonitor.endTiming('dynamic_connection_test');

        // 统计事件
        const connectedEvents = eventCollector.getEventCount('connected');
        const disconnectedEvents = eventCollector.getEventCount('disconnected');
        const errorEvents = eventCollector.getEventCount('error');

        const expectedConnections = maxConcurrent * operationCycles;

        console.log(`✅ 动态连接测试完成，时间: ${dynamicTime}ms`);
        console.log(`   操作周期: ${operationCycles}`);
        console.log(`   每周期连接数: ${maxConcurrent}`);
        console.log(`   连接事件: ${connectedEvents} (期望: ${expectedConnections})`);
        console.log(`   断开事件: ${disconnectedEvents}`);
        console.log(`   错误事件: ${errorEvents}`);
        console.log(`   连接成功率: ${(connectedEvents / expectedConnections * 100).toFixed(1)}%`);

        // 验证事件统计
        expect(connectedEvents).toBeGreaterThanOrEqual(expectedConnections * 0.8); // 80%成功率
        expect(errorEvents).toBeLessThan(expectedConnections * 0.2); // 错误率小于20%

      } finally {
        eventCollector.stop();
        
        // 确保所有连接都被清理
        for (const cm of connectionManagers) {
          await cm.destroy();
        }
      }
    });
  });

  describe('流数量限制测试', () => {
    
    it('应该正确处理最大流数量限制', async () => {
      const maxStreams = 500;
      const attemptedStreams = 600; // 超过限制
      
      const connectionManager = new BinanceConnectionManager();
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 50,
        autoRespondToPing: true
      });
      (global as any).WebSocket = mockWebSocketClass;

      try {
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

        perfMonitor.startTiming('max_streams_test');

        const streamNames = TestConfigGenerator.generateStreamNames(attemptedStreams);
        let successfulAdds = 0;
        let failedAdds = 0;

        // 逐个添加流以检测限制
        for (const stream of streamNames) {
          try {
            await connectionManager.addStream(stream);
            successfulAdds++;
            
            if (successfulAdds % 100 === 0) {
              console.log(`已添加 ${successfulAdds} 个流...`);
            }
          } catch (error) {
            failedAdds++;
            
            if (failedAdds === 1) {
              console.log(`达到流限制，错误: ${error.message}`);
            }
          }
        }

        const maxStreamTime = perfMonitor.endTiming('max_streams_test');

        const activeStreams = connectionManager.getActiveStreams();
        const metrics = connectionManager.getBinanceMetrics();

        console.log(`✅ 最大流数量测试完成，时间: ${maxStreamTime}ms`);
        console.log(`   流限制: ${maxStreams}`);
        console.log(`   尝试添加: ${attemptedStreams}`);
        console.log(`   成功添加: ${successfulAdds}`);
        console.log(`   失败添加: ${failedAdds}`);
        console.log(`   活跃流数: ${activeStreams.length}`);
        console.log(`   指标中流数: ${metrics.activeStreams}`);

        // 验证限制生效
        expect(successfulAdds).toBeLessThanOrEqual(maxStreams);
        expect(activeStreams.length).toBeLessThanOrEqual(maxStreams);
        expect(failedAdds).toBeGreaterThan(0);
        expect(activeStreams.length).toBe(successfulAdds);

      } finally {
        await connectionManager.destroy();
      }
    });

    it('应该在流操作高频时保持稳定性', async () => {
      const connectionManager = new BinanceConnectionManager();
      const operationCount = 1000;
      const maxConcurrentStreams = 100;
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 20,
        autoRespondToPing: true,
        messageDelay: 1
      });
      (global as any).WebSocket = mockWebSocketClass;

      try {
        const config = TestConfigGenerator.generateBinanceConnectionConfig({
          binance: {
            combinedStream: {
              streams: [],
              autoManage: false,
              maxStreams: maxConcurrentStreams * 2
            }
          }
        });

        await connectionManager.connect(config);

        const operationCollector = eventHelper.createEventCollector(connectionManager, [
          'streamAdded',
          'streamRemoved',
          'error'
        ]);

        perfMonitor.startTiming('high_frequency_stream_ops');

        // 高频流操作
        const operations: Promise<void>[] = [];
        const streamPool = TestConfigGenerator.generateStreamNames(maxConcurrentStreams * 2);

        for (let i = 0; i < operationCount; i++) {
          const operation = (async () => {
            const stream = streamPool[i % streamPool.length];
            const operationType = Math.random();

            try {
              if (operationType < 0.6) {
                // 60% 概率添加流
                await connectionManager.addStream(stream);
              } else {
                // 40% 概率移除流
                await connectionManager.removeStream(stream);
              }
            } catch (error) {
              // 忽略预期的错误（如流已存在、流不存在、达到限制等）
            }
          })();

          operations.push(operation);

          // 控制并发数以避免系统过载
          if (operations.length >= 50) {
            await Promise.allSettled(operations.splice(0, 25));
            await testUtils.delay(10);
          }
        }

        // 等待剩余操作完成
        await Promise.allSettled(operations);

        const highFreqTime = perfMonitor.endTiming('high_frequency_stream_ops');

        const metrics = connectionManager.getBinanceMetrics();
        const activeStreams = connectionManager.getActiveStreams();

        const streamAddedCount = operationCollector.getEventCount('streamAdded');
        const streamRemovedCount = operationCollector.getEventCount('streamRemoved');
        const errorCount = operationCollector.getEventCount('error');

        console.log(`✅ 高频流操作测试完成，时间: ${highFreqTime}ms`);
        console.log(`   总操作数: ${operationCount}`);
        console.log(`   操作频率: ${(operationCount / (highFreqTime / 1000)).toFixed(2)} ops/sec`);
        console.log(`   流添加事件: ${streamAddedCount}`);
        console.log(`   流移除事件: ${streamRemovedCount}`);
        console.log(`   错误事件: ${errorCount}`);
        console.log(`   最终活跃流: ${activeStreams.length}`);
        console.log(`   流变更总数: ${metrics.streamChanges}`);
        console.log(`   连接状态: ${connectionManager.isConnected() ? '正常' : '异常'}`);

        // 性能和稳定性断言
        expect(connectionManager.isConnected()).toBe(true);
        expect(activeStreams.length).toBeLessThanOrEqual(maxConcurrentStreams * 2);
        expect(errorCount).toBeLessThan(operationCount * 0.5); // 错误率小于50%

        operationCollector.stop();

      } finally {
        await connectionManager.destroy();
      }
    });
  });

  describe('内存压力测试', () => {
    
    it('应该在内存压力下保持稳定', async () => {
      const connectionCount = 20;
      const streamsPerConnection = 50;
      const connectionManagers: BinanceConnectionManager[] = [];
      
      const mockWebSocketClass = createMockWebSocket({
        connectDelay: 30,
        autoRespondToPing: true,
        messageDelay: 10
      });
      (global as any).WebSocket = mockWebSocketClass;

      perfMonitor.startTiming('memory_pressure_test');

      try {
        // 创建多个连接，每个连接有大量流
        for (let i = 0; i < connectionCount; i++) {
          const cm = new BinanceConnectionManager();
          connectionManagers.push(cm);
          
          const streams = TestConfigGenerator.generateStreamNames(streamsPerConnection, `conn${i}`);
          const config = TestConfigGenerator.generateBinanceConnectionConfig({
            url: `wss://stream.binance.com:9443/ws?memory=${i}`,
            binance: {
              combinedStream: {
                streams,
                autoManage: false,
                maxStreams: streamsPerConnection * 2
              }
            }
          });

          await cm.connect(config);
          
          // 验证连接成功
          expect(cm.isConnected()).toBe(true);
          expect(cm.getActiveStreams().length).toBe(streamsPerConnection);
          
          // 定期记录内存快照
          if (i % 5 === 0) {
            memoryMonitor.takeSnapshot();
          }
        }

        // 模拟大量消息处理
        const messageCount = 1000;
        for (let i = 0; i < messageCount; i++) {
          const cm = connectionManagers[i % connectionManagers.length];
          
          try {
            await cm.send({
              type: 'heartbeat',
              timestamp: Date.now(),
              data: `message_${i}`
            });
          } catch (error) {
            // 忽略发送错误
          }
          
          if (i % 100 === 0) {
            memoryMonitor.takeSnapshot();
            await testUtils.delay(50);
          }
        }

        const memoryPressureTime = perfMonitor.endTiming('memory_pressure_test');

        // 内存分析
        const finalMemory = process.memoryUsage();
        const leakCheck = memoryMonitor.checkForMemoryLeaks(100 * 1024 * 1024); // 100MB阈值
        const memoryTrend = memoryMonitor.getMemoryTrend();

        // 验证系统稳定性
        const connectedCount = connectionManagers.filter(cm => cm.isConnected()).length;
        const totalActiveStreams = connectionManagers.reduce(
          (sum, cm) => sum + cm.getActiveStreams().length, 0
        );

        console.log(`✅ 内存压力测试完成，时间: ${memoryPressureTime}ms`);
        console.log(`   连接数: ${connectionCount}`);
        console.log(`   每连接流数: ${streamsPerConnection}`);
        console.log(`   总流数: ${totalActiveStreams}`);
        console.log(`   消息数: ${messageCount}`);
        console.log(`   连接成功率: ${(connectedCount / connectionCount * 100).toFixed(1)}%`);
        console.log(`   堆内存使用: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   外部内存: ${(finalMemory.external / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   内存增长: ${(leakCheck.totalGrowth / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   内存趋势: ${memoryTrend?.trend || '无数据'}`);
        console.log(`   内存泄漏: ${leakCheck.hasLeak ? '检测到' : '无'}`);

        // 性能和稳定性断言
        expect(connectedCount).toBeGreaterThanOrEqual(connectionCount * 0.9); // 90%连接成功率
        expect(leakCheck.hasLeak).toBe(false); // 无严重内存泄漏
        expect(finalMemory.heapUsed).toBeLessThan(500 * 1024 * 1024); // 堆内存小于500MB

      } finally {
        // 批量清理连接
        const cleanupPromises = connectionManagers.map(async (cm, index) => {
          try {
            await cm.destroy();
          } catch (error) {
            console.warn(`清理连接${index}失败:`, error.message);
          }
        });
        
        await Promise.allSettled(cleanupPromises);
        
        // 强制垃圾回收
        await memoryMonitor.forceGC();
        await testUtils.delay(500);
      }
    });
  });

  describe('网络异常压力测试', () => {
    
    it('应该在网络不稳定环境下保持韧性', async () => {
      const connectionManager = new BinanceConnectionManager();
      
      // 创建不稳定网络的Mock
      const unstableMockClass = createMockWebSocket({
        connectDelay: 100,
        autoRespondToPing: false,
        simulateNetworkIssues: true,
        networkIssuesProbability: 0.3, // 30%网络问题概率
        messageDelay: 50
      });
      (global as any).WebSocket = unstableMockClass;

      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'connected',
        'disconnected', 
        'reconnecting',
        'reconnected',
        'error',
        'heartbeatTimeout'
      ]);

      perfMonitor.startTiming('network_instability_test');

      try {
        const config = TestConfigGenerator.generateBinanceConnectionConfig({
          maxRetries: 10,
          retryInterval: 1000,
          heartbeatInterval: 2000,
          heartbeatTimeout: 5000
        });

        // 建立初始连接
        await connectionManager.connect(config);
        expect(connectionManager.isConnected()).toBe(true);

        // 模拟网络不稳定期间的操作
        const testDuration = 30000; // 30秒测试
        const startTime = Date.now();
        
        const operations: Array<Promise<void>> = [];

        while (Date.now() - startTime < testDuration) {
          // 随机执行不同操作
          const operation = Math.random();
          
          if (operation < 0.3) {
            // 30% 概率添加流
            operations.push((async () => {
              try {
                const stream = `test${Date.now()}@ticker`;
                await connectionManager.addStream(stream);
              } catch (error) {
                // 网络问题可能导致失败
              }
            })());
          } else if (operation < 0.5) {
            // 20% 概率发送心跳
            operations.push((async () => {
              try {
                await connectionManager.ping();
              } catch (error) {
                // 心跳失败是正常的
              }
            })());
          } else if (operation < 0.7) {
            // 20% 概率发送消息
            operations.push((async () => {
              try {
                await connectionManager.send({ type: 'test', timestamp: Date.now() });
              } catch (error) {
                // 发送失败是正常的
              }
            })());
          } else {
            // 30% 概率等待
            await testUtils.delay(500);
          }

          // 控制操作频率
          if (operations.length >= 10) {
            await Promise.allSettled(operations.splice(0, 5));
            await testUtils.delay(200);
          }
        }

        // 等待剩余操作完成
        await Promise.allSettled(operations);

        const instabilityTime = perfMonitor.endTiming('network_instability_test');

        // 统计事件
        const connectedCount = eventCollector.getEventCount('connected');
        const disconnectedCount = eventCollector.getEventCount('disconnected');
        const reconnectingCount = eventCollector.getEventCount('reconnecting');
        const reconnectedCount = eventCollector.getEventCount('reconnected');
        const errorCount = eventCollector.getEventCount('error');
        const timeoutCount = eventCollector.getEventCount('heartbeatTimeout');

        const metrics = connectionManager.getBinanceMetrics();
        const finalConnectionStatus = connectionManager.isConnected();

        console.log(`✅ 网络不稳定测试完成，时间: ${instabilityTime}ms`);
        console.log(`   测试持续时间: ${testDuration}ms`);
        console.log(`   连接事件: ${connectedCount}`);
        console.log(`   断开事件: ${disconnectedCount}`);
        console.log(`   重连尝试: ${reconnectingCount}`);
        console.log(`   重连成功: ${reconnectedCount}`);
        console.log(`   错误事件: ${errorCount}`);
        console.log(`   心跳超时: ${timeoutCount}`);
        console.log(`   最终连接状态: ${finalConnectionStatus ? '已连接' : '未连接'}`);
        console.log(`   重连计数: ${metrics.reconnectCount}`);
        console.log(`   流变更: ${metrics.streamChanges}`);
        console.log(`   韧性评估: ${reconnectedCount > 0 ? '良好' : '需改进'}`);

        // 韧性验证
        // 在网络不稳定的情况下，系统应该展现一定的韧性
        // 即使最终连接失败，也应该有重连尝试
        expect(reconnectingCount).toBeGreaterThan(0); // 应该有重连尝试
        expect(metrics.reconnectCount).toBeGreaterThan(0); // 指标中应该记录重连

      } finally {
        eventCollector.stop();
        await connectionManager.destroy();
      }
    });
  });
});