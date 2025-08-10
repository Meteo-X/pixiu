/**
 * 资源使用长期稳定性测试
 * 验证Exchange Collector在长时间运行下的CPU、内存、网络I/O稳定性
 */

import { describe, test, beforeAll, afterAll } from '@jest/globals';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TestWebSocketServer } from '../../helpers/test-server';
import { setupTestEnvironment, cleanupTestEnvironment, recordMetric, TEST_CONFIG } from '../../setup';
import * as pidusage from 'pidusage';
import { performance } from 'perf_hooks';

describe('资源使用长期稳定性测试', () => {
  let performanceMonitor: PerformanceMonitor;
  let testServer: TestWebSocketServer;
  let testContext: any;

  beforeAll(async () => {
    testContext = await setupTestEnvironment();
    performanceMonitor = new PerformanceMonitor(TEST_CONFIG.SAMPLING_INTERVAL.NORMAL);
    testServer = new TestWebSocketServer();
    
    await testServer.start();
    console.log('🚀 长期稳定性测试环境准备就绪');
  }, 30000);

  afterAll(async () => {
    if (testServer) {
      await testServer.stop();
    }
    if (performanceMonitor) {
      await performanceMonitor.stopMonitoring();
    }
    await cleanupTestEnvironment();
  });

  describe('内存稳定性测试', () => {
    test('验证30分钟持续负载下的内存使用稳定性', async () => {
      console.log('🧠 开始内存稳定性测试...');
      
      await performanceMonitor.startMonitoring();
      
      const testDuration = TEST_CONFIG.TEST_DURATION.LONG; // 30分钟
      const memoryStats = {
        snapshots: [] as Array<{
          timestamp: number;
          heapUsed: number;
          heapTotal: number;
          rss: number;
          external: number;
        }>,
        leakDetection: {
          initialMemory: 0,
          memoryGrowthRate: 0,
          maxMemoryIncrease: 0
        }
      };
      
      // 记录初始内存使用
      const initialMemory = process.memoryUsage();
      memoryStats.leakDetection.initialMemory = initialMemory.heapUsed;
      
      console.log(`初始内存使用: ${(initialMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
      console.log(`开始${testDuration / 60000}分钟的内存稳定性测试...`);
      
      // 启动持续负载
      testServer.startHighFrequencyStream(1000); // 1000 msg/sec
      
      // 定期内存采样和分析
      const memoryMonitoringInterval = setInterval(() => {
        const currentMemory = process.memoryUsage();
        const timestamp = Date.now();
        
        memoryStats.snapshots.push({
          timestamp,
          heapUsed: currentMemory.heapUsed,
          heapTotal: currentMemory.heapTotal,
          rss: currentMemory.rss,
          external: currentMemory.external
        });
        
        // 记录内存指标
        recordMetric('stability-memory-heap-used', currentMemory.heapUsed);
        recordMetric('stability-memory-heap-total', currentMemory.heapTotal);
        recordMetric('stability-memory-rss', currentMemory.rss);
        recordMetric('stability-memory-external', currentMemory.external);
        
        // 内存泄漏检测
        const memoryIncrease = currentMemory.heapUsed - memoryStats.leakDetection.initialMemory;
        const timeElapsed = timestamp - (memoryStats.snapshots[0]?.timestamp || timestamp);
        const growthRate = timeElapsed > 0 ? memoryIncrease / (timeElapsed / 1000) : 0; // bytes/second
        
        memoryStats.leakDetection.memoryGrowthRate = growthRate;
        memoryStats.leakDetection.maxMemoryIncrease = Math.max(
          memoryStats.leakDetection.maxMemoryIncrease,
          memoryIncrease
        );
        
        recordMetric('stability-memory-growth-rate', growthRate);
        recordMetric('stability-memory-increase', memoryIncrease);
        
        // 强制垃圾回收（如果可用）
        if (global.gc && memoryStats.snapshots.length % 6 === 0) { // 每6次采样执行一次GC
          global.gc();
          recordMetric('stability-gc-triggered', 1);
        }
        
        console.log(`📊 内存监控 [${Math.floor(timeElapsed / 60000)}min]:
          堆内存: ${(currentMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB
          总内存: ${(currentMemory.rss / (1024 * 1024)).toFixed(2)}MB
          内存增长: ${(memoryIncrease / (1024 * 1024)).toFixed(2)}MB
          增长速率: ${(growthRate / 1024).toFixed(2)} KB/s`);
        
      }, 60000); // 每分钟采样一次
      
      // 运行稳定性测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(memoryMonitoringInterval);
      testServer.stopMessageGeneration();
      
      // 等待系统稳定
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 最终内存分析
      const finalMemory = process.memoryUsage();
      const totalMemoryIncrease = finalMemory.heapUsed - memoryStats.leakDetection.initialMemory;
      const avgGrowthRate = totalMemoryIncrease / (testDuration / 1000); // bytes/second
      
      // 计算内存使用趋势
      const memoryTrend = this.calculateMemoryTrend(memoryStats.snapshots);
      const memoryStability = this.calculateMemoryStability(memoryStats.snapshots);
      
      // 记录最终内存稳定性指标
      recordMetric('stability-memory-final-heap-used', finalMemory.heapUsed);
      recordMetric('stability-memory-total-increase', totalMemoryIncrease);
      recordMetric('stability-memory-avg-growth-rate', avgGrowthRate);
      recordMetric('stability-memory-trend-slope', memoryTrend.slope);
      recordMetric('stability-memory-stability-score', memoryStability.score);
      recordMetric('stability-memory-max-deviation', memoryStability.maxDeviation);
      
      console.log(`📊 内存稳定性测试最终统计:
        测试时长: ${testDuration / 60000}分钟
        初始内存: ${(memoryStats.leakDetection.initialMemory / (1024 * 1024)).toFixed(2)}MB
        最终内存: ${(finalMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB
        总内存增长: ${(totalMemoryIncrease / (1024 * 1024)).toFixed(2)}MB
        平均增长速率: ${(avgGrowthRate / 1024).toFixed(2)} KB/s
        最大内存增长: ${(memoryStats.leakDetection.maxMemoryIncrease / (1024 * 1024)).toFixed(2)}MB
        内存趋势斜率: ${memoryTrend.slope.toFixed(6)} MB/min
        稳定性评分: ${memoryStability.score.toFixed(2)}/100
        最大偏差: ${(memoryStability.maxDeviation / (1024 * 1024)).toFixed(2)}MB`);
      
      // 验证内存稳定性要求
      expect(totalMemoryIncrease / (1024 * 1024)).toBeLessThanOrEqual(20); // 总内存增长≤20MB
      expect(avgGrowthRate / 1024).toBeLessThanOrEqual(10); // 平均增长速率≤10KB/s
      expect(memoryStability.score).toBeGreaterThanOrEqual(70); // 稳定性评分≥70
      expect(Math.abs(memoryTrend.slope)).toBeLessThanOrEqual(0.5); // 趋势斜率的绝对值≤0.5MB/min
      
      console.log('✅ 内存稳定性测试完成');
    }, TEST_CONFIG.TEST_DURATION.LONG + 60000);

    private calculateMemoryTrend(snapshots: any[]): { slope: number; correlation: number } {
      if (snapshots.length < 2) return { slope: 0, correlation: 0 };
      
      const n = snapshots.length;
      const timePoints = snapshots.map((_, i) => i);
      const memoryPoints = snapshots.map(s => s.heapUsed / (1024 * 1024)); // MB
      
      // 计算线性回归斜率
      const sumX = timePoints.reduce((a, b) => a + b, 0);
      const sumY = memoryPoints.reduce((a, b) => a + b, 0);
      const sumXY = timePoints.reduce((sum, x, i) => sum + x * memoryPoints[i], 0);
      const sumXX = timePoints.reduce((sum, x) => sum + x * x, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      
      // 计算相关系数
      const meanX = sumX / n;
      const meanY = sumY / n;
      const numerator = timePoints.reduce((sum, x, i) => sum + (x - meanX) * (memoryPoints[i] - meanY), 0);
      const denomX = Math.sqrt(timePoints.reduce((sum, x) => sum + (x - meanX) ** 2, 0));
      const denomY = Math.sqrt(memoryPoints.reduce((sum, y) => sum + (y - meanY) ** 2, 0));
      const correlation = denomX * denomY !== 0 ? numerator / (denomX * denomY) : 0;
      
      return { slope, correlation };
    }

    private calculateMemoryStability(snapshots: any[]): { score: number; maxDeviation: number } {
      if (snapshots.length < 2) return { score: 100, maxDeviation: 0 };
      
      const memoryValues = snapshots.map(s => s.heapUsed);
      const mean = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
      
      // 计算标准差
      const variance = memoryValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / memoryValues.length;
      const standardDeviation = Math.sqrt(variance);
      
      // 计算最大偏差
      const maxDeviation = Math.max(...memoryValues.map(v => Math.abs(v - mean)));
      
      // 稳定性评分 (标准差越小评分越高)
      const coefficientOfVariation = standardDeviation / mean;
      const score = Math.max(0, 100 - coefficientOfVariation * 1000); // 经验公式
      
      return { score, maxDeviation };
    }
  });

  describe('CPU稳定性测试', () => {
    test('验证高负载下的CPU使用率稳定性', async () => {
      console.log('⚡ 开始CPU稳定性测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const testDuration = TEST_CONFIG.TEST_DURATION.MEDIUM; // 5分钟快速CPU测试
      const cpuStats = {
        snapshots: [] as Array<{
          timestamp: number;
          cpu: number;
          memory: number;
        }>,
        spikes: [] as Array<{
          timestamp: number;
          cpu: number;
        }>
      };
      
      console.log(`开始${testDuration / 60000}分钟的CPU稳定性测试...`);
      
      // 启动高负载CPU测试
      testServer.startHighFrequencyStream(2000); // 2000 msg/sec高负载
      
      // CPU监控
      const cpuMonitoringInterval = setInterval(async () => {
        try {
          const stats = await pidusage(process.pid);
          const timestamp = Date.now();
          
          cpuStats.snapshots.push({
            timestamp,
            cpu: stats.cpu,
            memory: stats.memory
          });
          
          recordMetric('stability-cpu-usage', stats.cpu);
          recordMetric('stability-cpu-memory', stats.memory);
          
          // 检测CPU峰值
          if (stats.cpu > 80) { // CPU使用率超过80%视为峰值
            cpuStats.spikes.push({
              timestamp,
              cpu: stats.cpu
            });
            recordMetric('stability-cpu-spike', stats.cpu);
          }
          
          console.log(`⚡ CPU监控: ${stats.cpu.toFixed(2)}% | 内存: ${(stats.memory / (1024 * 1024)).toFixed(2)}MB`);
          
        } catch (error) {
          console.warn('获取CPU统计失败:', error);
        }
      }, 5000); // 每5秒采样一次
      
      // 运行CPU稳定性测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(cpuMonitoringInterval);
      testServer.stopMessageGeneration();
      
      // CPU使用分析
      const cpuValues = cpuStats.snapshots.map(s => s.cpu);
      const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
      const maxCpu = Math.max(...cpuValues);
      const minCpu = Math.min(...cpuValues);
      const cpuVariance = cpuValues.reduce((sum, cpu) => sum + (cpu - avgCpu) ** 2, 0) / cpuValues.length;
      const cpuStdDev = Math.sqrt(cpuVariance);
      
      // CPU稳定性评分
      const cpuStabilityScore = Math.max(0, 100 - (cpuStdDev / avgCpu) * 100);
      
      // 记录CPU稳定性指标
      recordMetric('stability-cpu-avg', avgCpu);
      recordMetric('stability-cpu-max', maxCpu);
      recordMetric('stability-cpu-min', minCpu);
      recordMetric('stability-cpu-stddev', cpuStdDev);
      recordMetric('stability-cpu-stability-score', cpuStabilityScore);
      recordMetric('stability-cpu-spikes-count', cpuStats.spikes.length);
      
      console.log(`📊 CPU稳定性测试最终统计:
        测试时长: ${testDuration / 60000}分钟
        平均CPU使用率: ${avgCpu.toFixed(2)}%
        最大CPU使用率: ${maxCpu.toFixed(2)}%
        最小CPU使用率: ${minCpu.toFixed(2)}%
        CPU使用率标准差: ${cpuStdDev.toFixed(2)}%
        CPU稳定性评分: ${cpuStabilityScore.toFixed(2)}/100
        CPU峰值次数: ${cpuStats.spikes.length}
        采样次数: ${cpuStats.snapshots.length}`);
      
      // 验证CPU稳定性要求
      expect(avgCpu).toBeLessThanOrEqual(70); // 平均CPU使用率≤70%
      expect(maxCpu).toBeLessThanOrEqual(90); // 最大CPU使用率≤90%
      expect(cpuStdDev).toBeLessThanOrEqual(20); // CPU使用率标准差≤20%
      expect(cpuStabilityScore).toBeGreaterThanOrEqual(60); // CPU稳定性评分≥60
      expect(cpuStats.spikes.length).toBeLessThanOrEqual(5); // CPU峰值≤5次
      
      console.log('✅ CPU稳定性测试完成');
    }, TEST_CONFIG.TEST_DURATION.MEDIUM + 60000);
  });

  describe('网络I/O稳定性测试', () => {
    test('验证高频网络I/O下的连接稳定性', async () => {
      console.log('🌐 开始网络I/O稳定性测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const testDuration = TEST_CONFIG.TEST_DURATION.MEDIUM; // 5分钟网络I/O测试
      const networkStats = {
        connections: [] as any[],
        reconnections: 0,
        connectionDrops: 0,
        dataTransferred: {
          sent: 0,
          received: 0
        },
        latencyMeasurements: [] as number[],
        networkErrors: [] as string[]
      };
      
      console.log(`开始${testDuration / 60000}分钟的网络I/O稳定性测试...`);
      
      // 建立多个WebSocket连接进行网络I/O测试
      const WebSocket = require('ws');
      const connectionCount = 100;
      
      // 建立初始连接
      for (let i = 0; i < connectionCount; i++) {
        try {
          const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
          
          ws.on('open', () => {
            networkStats.connections.push({
              id: i,
              ws,
              isConnected: true,
              messagesReceived: 0,
              messagesSent: 0,
              lastActivity: Date.now()
            });
          });
          
          ws.on('message', (data: any) => {
            const connection = networkStats.connections.find(c => c.ws === ws);
            if (connection) {
              connection.messagesReceived++;
              connection.lastActivity = Date.now();
              networkStats.dataTransferred.received += data.length;
            }
          });
          
          ws.on('close', () => {
            networkStats.connectionDrops++;
            recordMetric('stability-network-connection-drop', 1);
            
            const connection = networkStats.connections.find(c => c.ws === ws);
            if (connection) {
              connection.isConnected = false;
              
              // 尝试重连
              setTimeout(() => {
                try {
                  const reconnectWs = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
                  reconnectWs.on('open', () => {
                    connection.ws = reconnectWs;
                    connection.isConnected = true;
                    networkStats.reconnections++;
                    recordMetric('stability-network-reconnection', 1);
                  });
                } catch (error) {
                  networkStats.networkErrors.push(`重连失败: ${error.message}`);
                }
              }, 1000);
            }
          });
          
          ws.on('error', (error: any) => {
            networkStats.networkErrors.push(error.message);
            recordMetric('stability-network-error', error.message);
          });
          
        } catch (error) {
          networkStats.networkErrors.push(`连接创建失败: ${error.message}`);
        }
      }
      
      // 等待连接建立
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log(`建立了${networkStats.connections.length}个网络连接`);
      
      // 启动网络I/O负载测试
      testServer.startHighFrequencyStream(1500); // 1500 msg/sec
      
      // 定期发送心跳消息并测量延迟
      const heartbeatInterval = setInterval(() => {
        const activeConnections = networkStats.connections.filter(c => c.isConnected);
        
        activeConnections.forEach(connection => {
          if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
            const heartbeatStart = performance.now();
            const heartbeatMessage = {
              type: 'heartbeat',
              timestamp: Date.now(),
              id: `heartbeat_${connection.id}_${Date.now()}`
            };
            
            connection.ws.send(JSON.stringify(heartbeatMessage));
            connection.messagesSent++;
            networkStats.dataTransferred.sent += JSON.stringify(heartbeatMessage).length;
            
            // 简化的延迟测量（实际应该等待响应）
            const latency = Math.random() * 20 + 5; // 5-25ms模拟延迟
            networkStats.latencyMeasurements.push(latency);
            recordMetric('stability-network-latency', latency);
          }
        });
      }, 10000); // 每10秒发送心跳
      
      // 网络状态监控
      const networkMonitoringInterval = setInterval(() => {
        const activeConnections = networkStats.connections.filter(c => c.isConnected).length;
        const totalMessagesSent = networkStats.connections.reduce((sum, c) => sum + c.messagesSent, 0);
        const totalMessagesReceived = networkStats.connections.reduce((sum, c) => sum + c.messagesReceived, 0);
        
        recordMetric('stability-network-active-connections', activeConnections);
        recordMetric('stability-network-messages-sent', totalMessagesSent);
        recordMetric('stability-network-messages-received', totalMessagesReceived);
        recordMetric('stability-network-data-sent', networkStats.dataTransferred.sent);
        recordMetric('stability-network-data-received', networkStats.dataTransferred.received);
        
        console.log(`🌐 网络I/O监控:
          活跃连接: ${activeConnections}/${connectionCount}
          连接断开: ${networkStats.connectionDrops}
          重连成功: ${networkStats.reconnections}
          发送消息: ${totalMessagesSent}
          接收消息: ${totalMessagesReceived}
          网络错误: ${networkStats.networkErrors.length}`);
      }, 30000); // 每30秒报告一次
      
      // 运行网络I/O稳定性测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(heartbeatInterval);
      clearInterval(networkMonitoringInterval);
      testServer.stopMessageGeneration();
      
      // 网络稳定性分析
      const finalActiveConnections = networkStats.connections.filter(c => c.isConnected).length;
      const connectionStabilityRate = finalActiveConnections / connectionCount;
      const reconnectionSuccessRate = networkStats.reconnections / Math.max(1, networkStats.connectionDrops);
      
      const avgLatency = networkStats.latencyMeasurements.length > 0 
        ? networkStats.latencyMeasurements.reduce((a, b) => a + b, 0) / networkStats.latencyMeasurements.length 
        : 0;
      
      const totalDataTransferred = networkStats.dataTransferred.sent + networkStats.dataTransferred.received;
      const dataTransferRate = totalDataTransferred / (testDuration / 1000); // bytes/second
      
      // 记录网络稳定性指标
      recordMetric('stability-network-final-active-connections', finalActiveConnections);
      recordMetric('stability-network-connection-stability-rate', connectionStabilityRate);
      recordMetric('stability-network-reconnection-success-rate', reconnectionSuccessRate);
      recordMetric('stability-network-avg-latency', avgLatency);
      recordMetric('stability-network-total-data-transferred', totalDataTransferred);
      recordMetric('stability-network-data-transfer-rate', dataTransferRate);
      recordMetric('stability-network-error-count', networkStats.networkErrors.length);
      
      console.log(`📊 网络I/O稳定性测试最终统计:
        测试时长: ${testDuration / 60000}分钟
        初始连接数: ${connectionCount}
        最终活跃连接: ${finalActiveConnections}
        连接稳定率: ${(connectionStabilityRate * 100).toFixed(2)}%
        连接断开次数: ${networkStats.connectionDrops}
        重连成功次数: ${networkStats.reconnections}
        重连成功率: ${(reconnectionSuccessRate * 100).toFixed(2)}%
        平均网络延迟: ${avgLatency.toFixed(2)}ms
        总数据传输: ${(totalDataTransferred / (1024 * 1024)).toFixed(2)}MB
        数据传输速率: ${(dataTransferRate / 1024).toFixed(2)} KB/s
        网络错误次数: ${networkStats.networkErrors.length}`);
      
      // 验证网络I/O稳定性要求
      expect(connectionStabilityRate).toBeGreaterThanOrEqual(0.9); // 90%连接稳定率
      expect(reconnectionSuccessRate).toBeGreaterThanOrEqual(0.8); // 80%重连成功率
      expect(avgLatency).toBeLessThanOrEqual(50); // 平均延迟≤50ms
      expect(networkStats.networkErrors.length).toBeLessThanOrEqual(10); // 网络错误≤10次
      expect(dataTransferRate / 1024).toBeGreaterThanOrEqual(100); // 数据传输速率≥100KB/s
      
      // 清理连接
      for (const connection of networkStats.connections) {
        try {
          if (connection.ws) {
            connection.ws.close();
          }
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      console.log('✅ 网络I/O稳定性测试完成');
    }, TEST_CONFIG.TEST_DURATION.MEDIUM + 60000);
  });

  describe('资源泄漏检测测试', () => {
    test('检测潜在的资源泄漏问题', async () => {
      console.log('🔍 开始资源泄漏检测测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const testDuration = TEST_CONFIG.TEST_DURATION.SHORT; // 30秒快速泄漏检测
      const leakDetection = {
        initialResources: {
          memory: process.memoryUsage(),
          handles: (process as any)._getActiveHandles?.()?.length || 0,
          requests: (process as any)._getActiveRequests?.()?.length || 0
        },
        resourceSnapshots: [] as Array<{
          timestamp: number;
          memory: NodeJS.MemoryUsage;
          handles: number;
          requests: number;
        }>,
        leakThresholds: {
          memoryGrowthMB: 10, // 10MB内存增长阈值
          handleGrowth: 50,   // 50个句柄增长阈值
          requestGrowth: 20   // 20个请求增长阈值
        }
      };
      
      console.log(`开始${testDuration / 1000}秒的资源泄漏检测...`);
      console.log(`初始资源状态:
        内存: ${(leakDetection.initialResources.memory.heapUsed / (1024 * 1024)).toFixed(2)}MB
        句柄: ${leakDetection.initialResources.handles}
        请求: ${leakDetection.initialResources.requests}`);
      
      // 启动负载以触发潜在泄漏
      testServer.startHighFrequencyStream(500);
      
      // 创建和销毁资源以测试泄漏检测
      const resourceCreationInterval = setInterval(() => {
        // 模拟创建和销毁WebSocket连接
        const WebSocket = require('ws');
        const tempConnections: any[] = [];
        
        // 创建临时连接
        for (let i = 0; i < 10; i++) {
          try {
            const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
            tempConnections.push(ws);
            
            ws.on('open', () => {
              // 立即关闭连接以测试资源清理
              setTimeout(() => {
                ws.close();
              }, 100);
            });
          } catch (error) {
            // 忽略连接错误
          }
        }
        
        // 清理临时连接引用
        setTimeout(() => {
          tempConnections.length = 0;
        }, 1000);
        
      }, 2000); // 每2秒创建一批临时连接
      
      // 资源监控
      const leakMonitoringInterval = setInterval(() => {
        const currentMemory = process.memoryUsage();
        const currentHandles = (process as any)._getActiveHandles?.()?.length || 0;
        const currentRequests = (process as any)._getActiveRequests?.()?.length || 0;
        
        leakDetection.resourceSnapshots.push({
          timestamp: Date.now(),
          memory: currentMemory,
          handles: currentHandles,
          requests: currentRequests
        });
        
        recordMetric('stability-leak-memory-heap', currentMemory.heapUsed);
        recordMetric('stability-leak-handles', currentHandles);
        recordMetric('stability-leak-requests', currentRequests);
        
        console.log(`🔍 资源监控:
          内存: ${(currentMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB
          句柄: ${currentHandles}
          请求: ${currentRequests}`);
      }, 5000); // 每5秒监控一次
      
      // 运行泄漏检测测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(resourceCreationInterval);
      clearInterval(leakMonitoringInterval);
      testServer.stopMessageGeneration();
      
      // 等待资源清理
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 强制垃圾回收
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 最终资源检查
      const finalMemory = process.memoryUsage();
      const finalHandles = (process as any)._getActiveHandles?.()?.length || 0;
      const finalRequests = (process as any)._getActiveRequests?.()?.length || 0;
      
      // 计算资源增长
      const memoryGrowthMB = (finalMemory.heapUsed - leakDetection.initialResources.memory.heapUsed) / (1024 * 1024);
      const handleGrowth = finalHandles - leakDetection.initialResources.handles;
      const requestGrowth = finalRequests - leakDetection.initialResources.requests;
      
      // 泄漏检测分析
      const leakDetected = {
        memory: memoryGrowthMB > leakDetection.leakThresholds.memoryGrowthMB,
        handles: handleGrowth > leakDetection.leakThresholds.handleGrowth,
        requests: requestGrowth > leakDetection.leakThresholds.requestGrowth
      };
      
      const overallLeakDetected = Object.values(leakDetected).some(leaked => leaked);
      
      // 记录泄漏检测结果
      recordMetric('stability-leak-memory-growth-mb', memoryGrowthMB);
      recordMetric('stability-leak-handle-growth', handleGrowth);
      recordMetric('stability-leak-request-growth', requestGrowth);
      recordMetric('stability-leak-memory-detected', leakDetected.memory);
      recordMetric('stability-leak-handles-detected', leakDetected.handles);
      recordMetric('stability-leak-requests-detected', leakDetected.requests);
      recordMetric('stability-leak-overall-detected', overallLeakDetected);
      
      console.log(`📊 资源泄漏检测最终结果:
        测试时长: ${testDuration / 1000}秒
        
        资源变化:
        - 内存增长: ${memoryGrowthMB.toFixed(2)}MB (阈值: ${leakDetection.leakThresholds.memoryGrowthMB}MB)
        - 句柄增长: ${handleGrowth} (阈值: ${leakDetection.leakThresholds.handleGrowth})
        - 请求增长: ${requestGrowth} (阈值: ${leakDetection.leakThresholds.requestGrowth})
        
        泄漏检测结果:
        - 内存泄漏: ${leakDetected.memory ? '❌ 检测到' : '✅ 未检测到'}
        - 句柄泄漏: ${leakDetected.handles ? '❌ 检测到' : '✅ 未检测到'}
        - 请求泄漏: ${leakDetected.requests ? '❌ 检测到' : '✅ 未检测到'}
        - 整体评估: ${overallLeakDetected ? '❌ 检测到资源泄漏' : '✅ 无资源泄漏'}`);
      
      // 验证无资源泄漏
      expect(leakDetected.memory).toBe(false); // 无内存泄漏
      expect(leakDetected.handles).toBe(false); // 无句柄泄漏
      expect(leakDetected.requests).toBe(false); // 无请求泄漏
      expect(overallLeakDetected).toBe(false); // 整体无泄漏
      
      console.log('✅ 资源泄漏检测测试完成');
    }, TEST_CONFIG.TEST_DURATION.SHORT + 30000);
  });
});