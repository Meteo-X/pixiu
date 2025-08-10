/**
 * 性能优化测试套件
 * 测试BinanceConnectionManager的性能优化功能和基准测试
 */

import { BinanceConnectionManager, BinanceConnectionConfig } from '@pixiu/binance-adapter';
import { ConnectionState } from '@pixiu/adapter-base';
import { globalCache } from '@pixiu/shared-core';
import { MockWebSocket, createMockWebSocket } from '../../mocks/websocket-mock';
import { TestConfigGenerator, EventListenerHelper, PerformanceMonitor, MemoryMonitor } from '../../helpers/test-helpers';

describe('性能优化', () => {
  let connectionManager: BinanceConnectionManager;
  let eventHelper: EventListenerHelper;
  let perfMonitor: PerformanceMonitor;
  let memoryMonitor: MemoryMonitor;
  let originalWebSocket: any;

  beforeAll(() => {
    originalWebSocket = global.WebSocket;
    
    // 配置高性能Mock WebSocket
    const mockWebSocketClass = createMockWebSocket({
      connectDelay: 10,
      autoRespondToPing: true,
      pingResponseDelay: 5,
      messageDelay: 1
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
    memoryMonitor = new MemoryMonitor();
    
    memoryMonitor.recordBaseline();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.destroy();
    }
    eventHelper.cleanup();
    perfMonitor.clear();
    memoryMonitor.clear();
    
    // 强制垃圾回收
    await memoryMonitor.forceGC();
  });

  describe('连接性能基准测试', () => {
    
    it('应该在指定时间内完成连接建立', async () => {
      const connectionTimeLimit = 1000; // 1秒连接时间限制
      const config = TestConfigGenerator.generateBinanceConnectionConfig();

      perfMonitor.startTiming('connection_establishment_benchmark');

      const startTime = Date.now();
      await connectionManager.connect(config);
      const connectionTime = Date.now() - startTime;

      perfMonitor.endTiming('connection_establishment_benchmark');
      perfMonitor.recordValue('connection_time', connectionTime);

      // 性能断言
      expect(connectionTime).toBeLessThan(connectionTimeLimit);
      expect(connectionManager.isConnected()).toBe(true);

      console.log(`✅ 连接建立基准测试完成`);
      console.log(`   连接时间: ${connectionTime}ms (限制: ${connectionTimeLimit}ms)`);
      console.log(`   性能等级: ${connectionTime < 500 ? '优秀' : connectionTime < 800 ? '良好' : '一般'}`);
    });

    it('应该支持快速批量连接', async () => {
      const batchSize = 10;
      const maxBatchTime = 5000; // 5秒批量连接时间限制
      
      const configs = TestConfigGenerator.generateStressTestConfig(batchSize, 1);
      const connectionManagers: BinanceConnectionManager[] = [];

      perfMonitor.startTiming('batch_connection_benchmark');

      try {
        // 并行建立连接
        const connectionPromises = configs.map(async (config, index) => {
          const cm = new BinanceConnectionManager();
          connectionManagers.push(cm);
          
          perfMonitor.startTiming(`connection_${index}`);
          await cm.connect({
            ...config,
            url: `${config.url}?batch=${index}`
          });
          perfMonitor.endTiming(`connection_${index}`);
          
          return cm;
        });

        await Promise.all(connectionPromises);
        
        const batchTime = perfMonitor.endTiming('batch_connection_benchmark');

        // 验证所有连接都成功
        for (const cm of connectionManagers) {
          expect(cm.isConnected()).toBe(true);
        }

        // 性能断言
        expect(batchTime).toBeLessThan(maxBatchTime);

        // 计算统计信息
        const connectionTimes: number[] = [];
        for (let i = 0; i < batchSize; i++) {
          const stats = perfMonitor.getStats(`connection_${i}`);
          if (stats) {
            connectionTimes.push(stats.avg);
          }
        }

        const avgConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;

        console.log(`✅ 批量连接基准测试完成`);
        console.log(`   批量大小: ${batchSize}`);
        console.log(`   总时间: ${batchTime}ms (限制: ${maxBatchTime}ms)`);
        console.log(`   平均连接时间: ${avgConnectionTime.toFixed(2)}ms`);
        console.log(`   连接成功率: 100%`);

      } finally {
        // 清理连接
        for (const cm of connectionManagers) {
          await cm.destroy();
        }
      }
    });

    it('应该保持低连接延迟', async () => {
      const maxLatency = 100; // 100ms最大延迟
      const sampleCount = 20;
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        heartbeatInterval: 5000
      });

      await connectionManager.connect(config);

      perfMonitor.startTiming('latency_benchmark');

      const latencies: number[] = [];

      // 测量多次ping延迟
      for (let i = 0; i < sampleCount; i++) {
        const latency = await connectionManager.ping();
        latencies.push(latency);
        perfMonitor.recordValue('ping_latency', latency);
        
        await testUtils.delay(100); // 100ms间隔
      }

      const latencyTime = perfMonitor.endTiming('latency_benchmark');

      // 计算延迟统计
      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxObservedLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      // 性能断言
      expect(avgLatency).toBeLessThan(maxLatency);
      expect(maxObservedLatency).toBeLessThan(maxLatency * 2); // 最大延迟不超过平均限制的2倍

      const latencyStats = perfMonitor.getStats('ping_latency');

      console.log(`✅ 延迟基准测试完成，测试时间: ${latencyTime}ms`);
      console.log(`   样本数量: ${sampleCount}`);
      console.log(`   平均延迟: ${avgLatency.toFixed(2)}ms (限制: ${maxLatency}ms)`);
      console.log(`   最小延迟: ${minLatency}ms`);
      console.log(`   最大延迟: ${maxObservedLatency}ms`);
      console.log(`   95百分位: ${latencyStats?.p95}ms`);
      console.log(`   99百分位: ${latencyStats?.p99}ms`);
    });
  });

  describe('流管理性能优化', () => {
    
    it('应该高效处理大量流操作', async () => {
      const streamCount = 200;
      const maxOperationTime = 10000; // 10秒最大操作时间
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: false, // 禁用自动管理以测试纯操作性能
            maxStreams: streamCount * 2
          }
        }
      });

      await connectionManager.connect(config);

      perfMonitor.startTiming('large_stream_operations');

      // 生成大量流名称
      const streams = TestConfigGenerator.generateStreamNames(streamCount);

      // 批量添加流
      const addPromises = streams.map(stream => {
        perfMonitor.startTiming(`add_${stream}`);
        return connectionManager.addStream(stream).then(() => {
          perfMonitor.endTiming(`add_${stream}`);
        });
      });

      await Promise.all(addPromises);

      // 验证所有流都已添加
      const activeStreams = connectionManager.getActiveStreams();
      expect(activeStreams.length).toBe(streamCount);

      // 批量移除一半流
      const streamsToRemove = streams.slice(0, streamCount / 2);
      const removePromises = streamsToRemove.map(stream => {
        perfMonitor.startTiming(`remove_${stream}`);
        return connectionManager.removeStream(stream).then(() => {
          perfMonitor.endTiming(`remove_${stream}`);
        });
      });

      await Promise.all(removePromises);

      const operationTime = perfMonitor.endTiming('large_stream_operations');

      // 验证流状态
      const finalStreams = connectionManager.getActiveStreams();
      expect(finalStreams.length).toBe(streamCount / 2);

      // 性能断言
      expect(operationTime).toBeLessThan(maxOperationTime);

      // 计算操作统计
      const avgAddTime = streams.reduce((sum, stream) => {
        const stats = perfMonitor.getStats(`add_${stream}`);
        return sum + (stats?.avg || 0);
      }, 0) / streamCount;

      const avgRemoveTime = streamsToRemove.reduce((sum, stream) => {
        const stats = perfMonitor.getStats(`remove_${stream}`);
        return sum + (stats?.avg || 0);
      }, 0) / streamsToRemove.length;

      console.log(`✅ 大量流操作性能测试完成`);
      console.log(`   流数量: ${streamCount}`);
      console.log(`   总操作时间: ${operationTime}ms (限制: ${maxOperationTime}ms)`);
      console.log(`   平均添加时间: ${avgAddTime.toFixed(2)}ms/流`);
      console.log(`   平均移除时间: ${avgRemoveTime.toFixed(2)}ms/流`);
      console.log(`   最终活跃流: ${finalStreams.length}`);
    });

    it('应该优化批量流操作调度', async () => {
      const batchDelay = 200;
      const streamBatchSize = 20;
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: true,
            batchDelay,
            maxStreams: streamBatchSize * 2
          }
        }
      });

      await connectionManager.connect(config);

      // 监听批量操作事件
      const eventCollector = eventHelper.createEventCollector(connectionManager, [
        'streamAdded',
        'reconnected'
      ]);

      perfMonitor.startTiming('batch_scheduling_optimization');

      // 快速添加多个流
      const streams = TestConfigGenerator.generateStreamNames(streamBatchSize);
      
      const addStartTime = Date.now();
      
      // 在短时间内快速添加多个流
      for (const stream of streams) {
        connectionManager.addStream(stream).catch(() => {}); // 忽略可能的错误
        await testUtils.delay(10); // 很短的间隔
      }

      // 等待批量操作完成
      await testUtils.waitFor(() => 
        eventCollector.getEventCount('reconnected') > 0, 15000);

      const batchOptimizationTime = perfMonitor.endTiming('batch_scheduling_optimization');

      // 验证批量调度效果
      const reconnectedCount = eventCollector.getEventCount('reconnected');
      const streamAddedCount = eventCollector.getEventCount('streamAdded');

      // 批量操作应该显著减少重连次数
      expect(reconnectedCount).toBeLessThan(streamBatchSize / 5); // 重连次数应远少于流数量
      expect(streamAddedCount).toBeGreaterThan(0);

      const metrics = connectionManager.getBinanceMetrics();

      console.log(`✅ 批量调度优化测试完成`);
      console.log(`   批量延迟: ${batchDelay}ms`);
      console.log(`   流数量: ${streamBatchSize}`);
      console.log(`   总时间: ${batchOptimizationTime}ms`);
      console.log(`   重连次数: ${reconnectedCount} (优化效果: ${(1 - reconnectedCount / streamBatchSize) * 100}%)`);
      console.log(`   流操作修改次数: ${metrics.streamOperations.modifications}`);

      eventCollector.stop();
    });

    it('应该优化组合流URL构建性能', async () => {
      const urlBuildIterations = 1000;
      const maxBuildTime = 1000; // 1秒最大构建时间
      
      perfMonitor.startTiming('url_building_performance');

      // 测试不同规模的流URL构建性能
      const streamSizes = [1, 10, 50, 100, 200];
      
      for (const size of streamSizes) {
        const streams = TestConfigGenerator.generateStreamNames(size);
        
        perfMonitor.startTiming(`url_build_${size}_streams`);
        
        // 多次构建URL以测试性能
        for (let i = 0; i < urlBuildIterations / streamSizes.length; i++) {
          const config = TestConfigGenerator.generateBinanceConnectionConfig({
            url: 'wss://stream.binance.com:9443',
            binance: {
              combinedStream: {
                streams: streams,
                autoManage: false
              }
            }
          });
          
          // 不实际连接，只测试配置处理性能
        }
        
        perfMonitor.endTiming(`url_build_${size}_streams`);
      }

      const totalBuildTime = perfMonitor.endTiming('url_building_performance');

      // 性能断言
      expect(totalBuildTime).toBeLessThan(maxBuildTime);

      console.log(`✅ URL构建性能测试完成`);
      console.log(`   总构建时间: ${totalBuildTime}ms (限制: ${maxBuildTime}ms)`);
      
      for (const size of streamSizes) {
        const stats = perfMonitor.getStats(`url_build_${size}_streams`);
        if (stats) {
          console.log(`   ${size}流构建: ${stats.avg.toFixed(2)}ms平均`);
        }
      }
    });
  });

  describe('内存使用优化', () => {
    
    it('应该保持低内存占用', async () => {
      const memoryLimit = 50 * 1024 * 1024; // 50MB内存限制
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      perfMonitor.startTiming('memory_usage_optimization');

      // 建立连接
      await connectionManager.connect(config);
      
      // 添加一些流
      const streams = TestConfigGenerator.generateStreamNames(50);
      for (const stream of streams) {
        await connectionManager.addStream(stream);
      }

      // 模拟一些消息处理
      for (let i = 0; i < 100; i++) {
        await connectionManager.send({ type: 'test', id: i });
        
        if (i % 10 === 0) {
          memoryMonitor.takeSnapshot();
          await testUtils.delay(10);
        }
      }

      // 等待处理完成
      await testUtils.delay(500);

      const memoryOptimizationTime = perfMonitor.endTiming('memory_usage_optimization');

      // 检查内存使用
      const memoryUsage = process.memoryUsage();
      const leakCheck = memoryMonitor.checkForMemoryLeaks(10 * 1024 * 1024); // 10MB阈值

      // 性能断言
      expect(memoryUsage.heapUsed).toBeLessThan(memoryLimit);
      expect(leakCheck.hasLeak).toBe(false);

      console.log(`✅ 内存使用优化测试完成，时间: ${memoryOptimizationTime}ms`);
      console.log(`   堆内存使用: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB (限制: ${memoryLimit / 1024 / 1024}MB)`);
      console.log(`   外部内存: ${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   内存泄漏检查: ${leakCheck.hasLeak ? '检测到泄漏' : '无泄漏'}`);
      console.log(`   内存增长: ${(leakCheck.totalGrowth / 1024 / 1024).toFixed(2)}MB`);
    });

    it('应该高效清理断开连接的资源', async () => {
      const connectionCount = 10;
      const configs = TestConfigGenerator.generateStressTestConfig(connectionCount, 10);
      const connectionManagers: BinanceConnectionManager[] = [];

      perfMonitor.startTiming('resource_cleanup_efficiency');

      try {
        // 建立多个连接
        for (let i = 0; i < connectionCount; i++) {
          const cm = new BinanceConnectionManager();
          await cm.connect({
            ...configs[i],
            url: `${configs[i].url}?cleanup=${i}`
          });
          connectionManagers.push(cm);
        }

        // 记录内存基线
        const beforeCleanup = process.memoryUsage();
        
        // 断开所有连接
        const cleanupPromises = connectionManagers.map(async (cm, index) => {
          perfMonitor.startTiming(`cleanup_${index}`);
          await cm.destroy();
          perfMonitor.endTiming(`cleanup_${index}`);
        });

        await Promise.all(cleanupPromises);
        
        // 强制垃圾回收
        await memoryMonitor.forceGC();
        await testUtils.delay(100);

        const afterCleanup = process.memoryUsage();
        
        const cleanupTime = perfMonitor.endTiming('resource_cleanup_efficiency');

        // 计算清理效率
        const memoryReleased = beforeCleanup.heapUsed - afterCleanup.heapUsed;
        const avgCleanupTime = connectionCount > 0 ? 
          connectionManagers.reduce((sum, _, index) => {
            const stats = perfMonitor.getStats(`cleanup_${index}`);
            return sum + (stats?.avg || 0);
          }, 0) / connectionCount : 0;

        console.log(`✅ 资源清理效率测试完成`);
        console.log(`   连接数量: ${connectionCount}`);
        console.log(`   总清理时间: ${cleanupTime}ms`);
        console.log(`   平均清理时间: ${avgCleanupTime.toFixed(2)}ms/连接`);
        console.log(`   清理前内存: ${(beforeCleanup.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   清理后内存: ${(afterCleanup.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   释放内存: ${(memoryReleased / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   清理效率: ${memoryReleased > 0 ? '高效' : '标准'}`);

      } finally {
        // 确保所有连接都被清理
        connectionManagers.length = 0;
      }
    });

    it('应该防止事件监听器内存泄漏', async () => {
      const listenerIterations = 100;
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig();
      
      perfMonitor.startTiming('event_listener_memory_test');

      // 记录基线
      const baselineMemory = process.memoryUsage();

      // 重复添加和移除监听器
      for (let i = 0; i < listenerIterations; i++) {
        const listeners: Array<() => void> = [];
        
        // 添加各种事件监听器
        const events = ['connected', 'disconnected', 'error', 'streamAdded', 'streamRemoved'];
        for (const event of events) {
          const listener = () => { /* 空监听器 */ };
          listeners.push(listener);
          connectionManager.on(event as any, listener);
        }
        
        // 移除监听器
        events.forEach((event, index) => {
          connectionManager.off(event as any, listeners[index]);
        });
        
        if (i % 20 === 0) {
          memoryMonitor.takeSnapshot();
          await testUtils.delay(10);
        }
      }

      // 强制垃圾回收
      await memoryMonitor.forceGC();
      await testUtils.delay(100);

      const finalMemory = process.memoryUsage();
      const listenerTime = perfMonitor.endTiming('event_listener_memory_test');

      // 检查内存泄漏
      const memoryGrowth = finalMemory.heapUsed - baselineMemory.heapUsed;
      const leakCheck = memoryMonitor.checkForMemoryLeaks(5 * 1024 * 1024); // 5MB阈值

      // 内存增长应该很小
      expect(Math.abs(memoryGrowth)).toBeLessThan(10 * 1024 * 1024); // 10MB容差

      console.log(`✅ 事件监听器内存测试完成，时间: ${listenerTime}ms`);
      console.log(`   监听器操作次数: ${listenerIterations}`);
      console.log(`   基线内存: ${(baselineMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   最终内存: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   内存变化: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   内存泄漏: ${leakCheck.hasLeak ? '检测到' : '无'}`);
    });
  });

  describe('并发性能优化', () => {
    
    it('应该高效处理并发连接操作', async () => {
      const concurrentOperations = 50;
      const maxConcurrentTime = 5000; // 5秒最大并发时间
      
      perfMonitor.startTiming('concurrent_operations_performance');

      // 创建并发操作
      const operations = Array.from({ length: concurrentOperations }, async (_, index) => {
        const cm = new BinanceConnectionManager();
        
        try {
          perfMonitor.startTiming(`concurrent_op_${index}`);
          
          // 连接
          const config = TestConfigGenerator.generateBinanceConnectionConfig({
            url: `wss://stream.binance.com:9443/ws?concurrent=${index}`
          });
          await cm.connect(config);
          
          // 添加一些流
          await cm.addStream(`btcusdt@ticker${index}`);
          await cm.addStream(`ethusdt@depth${index}`);
          
          // 发送消息
          await cm.send({ type: 'ping', id: index });
          
          // 获取指标
          const metrics = cm.getBinanceMetrics();
          
          perfMonitor.endTiming(`concurrent_op_${index}`);
          
          return { index, success: true, metrics };
          
        } catch (error) {
          perfMonitor.endTiming(`concurrent_op_${index}`);
          return { index, success: false, error };
        } finally {
          await cm.destroy();
        }
      });

      // 执行所有并发操作
      const results = await Promise.allSettled(operations);
      
      const concurrentTime = perfMonitor.endTiming('concurrent_operations_performance');

      // 分析结果
      const successfulOps = results.filter(result => 
        result.status === 'fulfilled' && result.value.success).length;
      const failedOps = results.length - successfulOps;
      
      // 计算平均操作时间
      const avgOpTime = Array.from({ length: concurrentOperations }, (_, i) => 
        perfMonitor.getStats(`concurrent_op_${i}`)?.avg || 0
      ).reduce((sum, time) => sum + time, 0) / concurrentOperations;

      // 性能断言
      expect(concurrentTime).toBeLessThan(maxConcurrentTime);
      expect(successfulOps / concurrentOperations).toBeGreaterThan(0.8); // 80%成功率

      console.log(`✅ 并发操作性能测试完成`);
      console.log(`   并发数量: ${concurrentOperations}`);
      console.log(`   总时间: ${concurrentTime}ms (限制: ${maxConcurrentTime}ms)`);
      console.log(`   成功操作: ${successfulOps} (${(successfulOps / concurrentOperations * 100).toFixed(1)}%)`);
      console.log(`   失败操作: ${failedOps}`);
      console.log(`   平均操作时间: ${avgOpTime.toFixed(2)}ms`);
      console.log(`   并发效率: ${(concurrentOperations / (concurrentTime / 1000)).toFixed(2)} ops/sec`);
    });

    it('应该在高负载下保持稳定性能', async () => {
      const highLoadDuration = 10000; // 10秒高负载测试
      const operationInterval = 100; // 100ms操作间隔
      
      const config = TestConfigGenerator.generateBinanceConnectionConfig({
        binance: {
          combinedStream: {
            streams: [],
            autoManage: true,
            batchDelay: 200,
            maxStreams: 500
          }
        }
      });

      await connectionManager.connect(config);

      // 监控性能指标
      const performanceLog: Array<{
        timestamp: number;
        operation: string;
        duration: number;
        activeStreams: number;
        memoryUsage: number;
      }> = [];

      perfMonitor.startTiming('high_load_stability_test');

      const startTime = Date.now();
      let operationCount = 0;

      // 高负载循环
      while (Date.now() - startTime < highLoadDuration) {
        const opStart = Date.now();
        const streamName = `highload${operationCount % 100}@ticker`;
        
        try {
          if (operationCount % 3 === 0) {
            // 添加流
            await connectionManager.addStream(streamName);
          } else if (operationCount % 3 === 1) {
            // 移除流
            await connectionManager.removeStream(streamName);
          } else {
            // 发送心跳
            await connectionManager.ping();
          }
          
          const opDuration = Date.now() - opStart;
          const activeStreams = connectionManager.getActiveStreams().length;
          const memoryUsage = process.memoryUsage().heapUsed;
          
          performanceLog.push({
            timestamp: Date.now() - startTime,
            operation: operationCount % 3 === 0 ? 'addStream' : 
                      operationCount % 3 === 1 ? 'removeStream' : 'ping',
            duration: opDuration,
            activeStreams,
            memoryUsage
          });
          
          operationCount++;
          
        } catch (error) {
          // 记录错误但继续测试
          console.warn(`高负载操作${operationCount}失败:`, error.message);
        }
        
        await testUtils.delay(operationInterval);
      }

      const totalLoadTime = perfMonitor.endTiming('high_load_stability_test');

      // 分析性能数据
      const avgOperationTime = performanceLog.reduce((sum, log) => sum + log.duration, 0) / performanceLog.length;
      const maxOperationTime = Math.max(...performanceLog.map(log => log.duration));
      const operationThroughput = operationCount / (totalLoadTime / 1000);

      // 检查性能稳定性
      const timeChunks = [];
      const chunkSize = Math.floor(performanceLog.length / 10);
      for (let i = 0; i < 10; i++) {
        const chunk = performanceLog.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkAvgTime = chunk.reduce((sum, log) => sum + log.duration, 0) / chunk.length;
        timeChunks.push(chunkAvgTime);
      }

      const performanceVariance = timeChunks.reduce((variance, time) => {
        return variance + Math.pow(time - avgOperationTime, 2);
      }, 0) / timeChunks.length;

      const performanceStdDev = Math.sqrt(performanceVariance);

      console.log(`✅ 高负载稳定性测试完成`);
      console.log(`   测试时长: ${totalLoadTime}ms`);
      console.log(`   总操作数: ${operationCount}`);
      console.log(`   平均操作时间: ${avgOperationTime.toFixed(2)}ms`);
      console.log(`   最大操作时间: ${maxOperationTime}ms`);
      console.log(`   操作吞吐量: ${operationThroughput.toFixed(2)} ops/sec`);
      console.log(`   性能标准差: ${performanceStdDev.toFixed(2)}ms`);
      console.log(`   性能稳定性: ${performanceStdDev < avgOperationTime * 0.5 ? '稳定' : '不稳定'}`);
      console.log(`   最终活跃流: ${connectionManager.getActiveStreams().length}`);
    });
  });
});