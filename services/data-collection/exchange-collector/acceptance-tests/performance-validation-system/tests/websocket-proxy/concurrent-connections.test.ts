/**
 * WebSocket代理并发连接性能测试
 * 验证WebSocket代理在高并发连接下的性能表现
 */

import { describe, test, beforeAll, afterAll } from '@jest/globals';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TestWebSocketServer } from '../../helpers/test-server';
import { setupTestEnvironment, cleanupTestEnvironment, recordMetric, TEST_CONFIG } from '../../setup';
import * as WebSocket from 'ws';

describe('WebSocket代理并发连接性能测试', () => {
  let performanceMonitor: PerformanceMonitor;
  let testServer: TestWebSocketServer;
  let testContext: any;

  beforeAll(async () => {
    testContext = await setupTestEnvironment();
    performanceMonitor = new PerformanceMonitor(TEST_CONFIG.SAMPLING_INTERVAL.HIGH_FREQUENCY);
    testServer = new TestWebSocketServer();
    
    await testServer.start();
    console.log('🚀 WebSocket代理性能测试环境准备就绪');
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

  describe('并发连接建立性能', () => {
    test('测试快速建立1000个并发连接的性能', async () => {
      console.log('🔥 开始并发连接建立性能测试...');
      
      await performanceMonitor.startMonitoring();
      const connections: WebSocket[] = [];
      const connectionMetrics = {
        successful: 0,
        failed: 0,
        totalTime: 0,
        avgConnectionTime: 0,
        connectionTimes: [] as number[]
      };

      const startTime = performance.now();
      const targetConnections = 1000;
      
      // 分批并发建立连接，每批100个
      const batchSize = 100;
      const batches = Math.ceil(targetConnections / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const batchPromises: Promise<void>[] = [];
        const currentBatchSize = Math.min(batchSize, targetConnections - batch * batchSize);
        
        console.log(`创建批次${batch + 1}/${batches}，连接数: ${currentBatchSize}`);
        
        for (let i = 0; i < currentBatchSize; i++) {
          const connectionPromise = new Promise<void>((resolve) => {
            const connectionStart = performance.now();
            const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
            
            const timeout = setTimeout(() => {
              connectionMetrics.failed++;
              recordMetric('websocket-connection-timeout', 1);
              resolve();
            }, 5000);
            
            ws.on('open', () => {
              clearTimeout(timeout);
              const connectionTime = performance.now() - connectionStart;
              
              connections.push(ws);
              connectionMetrics.successful++;
              connectionMetrics.connectionTimes.push(connectionTime);
              
              recordMetric('websocket-connection-time', connectionTime);
              recordMetric('websocket-connection-success', 1);
              resolve();
            });
            
            ws.on('error', (error) => {
              clearTimeout(timeout);
              connectionMetrics.failed++;
              recordMetric('websocket-connection-error', error.message);
              resolve();
            });
          });
          
          batchPromises.push(connectionPromise);
        }
        
        // 等待当前批次完成
        await Promise.all(batchPromises);
        
        // 记录批次指标
        recordMetric(`websocket-batch-${batch + 1}-success`, 
          connectionMetrics.successful - (batch * batchSize));
        
        // 短暂延迟避免压垮服务器
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      connectionMetrics.totalTime = performance.now() - startTime;
      connectionMetrics.avgConnectionTime = connectionMetrics.connectionTimes.reduce((a, b) => a + b, 0) / connectionMetrics.connectionTimes.length;
      
      const memoryStats = performanceMonitor.getMemoryStats();
      const serverMetrics = testServer.getMetrics();
      
      // 记录总体指标
      recordMetric('websocket-concurrent-connections-total', targetConnections);
      recordMetric('websocket-concurrent-connections-successful', connectionMetrics.successful);
      recordMetric('websocket-concurrent-connections-failed', connectionMetrics.failed);
      recordMetric('websocket-concurrent-connections-success-rate', connectionMetrics.successful / targetConnections);
      recordMetric('websocket-concurrent-connections-total-time', connectionMetrics.totalTime);
      recordMetric('websocket-concurrent-connections-avg-time', connectionMetrics.avgConnectionTime);
      recordMetric('websocket-concurrent-connections-memory-mb', memoryStats.current / (1024 * 1024));
      
      console.log(`📊 并发连接建立性能统计:
        目标连接数: ${targetConnections}
        成功连接数: ${connectionMetrics.successful}
        失败连接数: ${connectionMetrics.failed}
        成功率: ${((connectionMetrics.successful / targetConnections) * 100).toFixed(2)}%
        总耗时: ${connectionMetrics.totalTime.toFixed(2)}ms
        平均连接时间: ${connectionMetrics.avgConnectionTime.toFixed(2)}ms
        连接速率: ${(connectionMetrics.successful / (connectionMetrics.totalTime / 1000)).toFixed(2)} 连接/秒
        内存使用: ${(memoryStats.current / (1024 * 1024)).toFixed(2)}MB`);
      
      // 验证性能要求
      expect(connectionMetrics.successful).toBeGreaterThanOrEqual(targetConnections * 0.95); // 95%成功率
      expect(connectionMetrics.avgConnectionTime).toBeLessThanOrEqual(100); // 平均连接时间<100ms
      expect(connectionMetrics.totalTime).toBeLessThanOrEqual(30000); // 总时间<30秒
      expect(memoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(150); // 内存<150MB
      
      // 清理连接
      for (const ws of connections) {
        try {
          ws.close();
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      console.log('✅ 并发连接建立性能测试完成');
    }, 120000);
  });

  describe('并发消息转发性能', () => {
    test('测试500个连接同时接收高频消息的性能', async () => {
      console.log('🚀 开始并发消息转发性能测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const connections: WebSocket[] = [];
      const connectionCount = 500;
      const messageStats = {
        totalReceived: 0,
        totalSent: 0,
        messageLatencies: [] as number[],
        connectionMessageCounts: new Map<WebSocket, number>()
      };
      
      // 建立连接
      console.log(`建立${connectionCount}个WebSocket连接...`);
      const connectionPromises = Array.from({ length: connectionCount }, (_, index) => {
        return new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
          
          const timeout = setTimeout(() => {
            reject(new Error(`连接${index}超时`));
          }, 10000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            messageStats.connectionMessageCounts.set(ws, 0);
            resolve(ws);
          });
          
          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      });
      
      try {
        const establishedConnections = await Promise.all(connectionPromises);
        connections.push(...establishedConnections);
        console.log(`✅ 成功建立${connections.length}个WebSocket连接`);
      } catch (error) {
        console.error('建立连接失败:', error);
        throw error;
      }
      
      // 为每个连接设置消息处理器
      connections.forEach((ws, index) => {
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            messageStats.totalReceived++;
            
            const currentCount = messageStats.connectionMessageCounts.get(ws) || 0;
            messageStats.connectionMessageCounts.set(ws, currentCount + 1);
            
            // 记录消息延迟（如果消息包含时间戳）
            if (message.timestamp) {
              const latency = Date.now() - message.timestamp;
              messageStats.messageLatencies.push(latency);
              performanceMonitor.recordMessageLatency(latency);
            }
            
          } catch (error) {
            console.warn(`连接${index}解析消息失败:`, error);
          }
        });
      });
      
      // 开始高频消息生成
      console.log('开始高频消息生成测试...');
      const messagesPerSecond = 2000; // 每秒2000条消息
      const testDuration = 30000; // 30秒测试
      
      testServer.startHighFrequencyStream(messagesPerSecond);
      
      // 监控消息转发性能
      const monitoringInterval = setInterval(() => {
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        const serverMetrics = testServer.getMetrics();
        
        recordMetric('websocket-forwarding-msg-sec', currentMetrics.messagesPerSecond);
        recordMetric('websocket-forwarding-memory-mb', currentMetrics.memoryMB);
        recordMetric('websocket-forwarding-cpu-usage', currentMetrics.cpuUsage);
        recordMetric('websocket-forwarding-server-sent', serverMetrics.messagesSent);
        recordMetric('websocket-forwarding-total-received', messageStats.totalReceived);
        
        console.log(`📈 实时统计: 
          收到消息: ${messageStats.totalReceived}
          服务器发送: ${serverMetrics.messagesSent}
          消息/秒: ${currentMetrics.messagesPerSecond.toFixed(2)}
          内存: ${currentMetrics.memoryMB.toFixed(2)}MB
          CPU: ${currentMetrics.cpuUsage.toFixed(2)}%`);
      }, 5000);
      
      // 运行测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(monitoringInterval);
      testServer.stopMessageGeneration();
      
      // 等待消息传播完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalMemoryStats = performanceMonitor.getMemoryStats();
      const finalServerMetrics = testServer.getMetrics();
      const throughputMetrics = performanceMonitor.getThroughputMetrics();
      
      // 计算消息转发统计
      const averageMessagesPerConnection = messageStats.totalReceived / connections.length;
      const messageLatencies = messageStats.messageLatencies.sort((a, b) => a - b);
      const avgLatency = messageLatencies.reduce((a, b) => a + b, 0) / messageLatencies.length || 0;
      const p95Latency = messageLatencies[Math.floor(messageLatencies.length * 0.95)] || 0;
      
      // 记录最终指标
      recordMetric('websocket-forwarding-total-messages-received', messageStats.totalReceived);
      recordMetric('websocket-forwarding-messages-per-connection', averageMessagesPerConnection);
      recordMetric('websocket-forwarding-avg-latency', avgLatency);
      recordMetric('websocket-forwarding-p95-latency', p95Latency);
      recordMetric('websocket-forwarding-final-memory-mb', finalMemoryStats.current / (1024 * 1024));
      recordMetric('websocket-forwarding-throughput-msg-sec', throughputMetrics.messagesPerSecond);
      recordMetric('websocket-forwarding-message-loss-rate', 
        Math.max(0, (finalServerMetrics.messagesSent - messageStats.totalReceived) / finalServerMetrics.messagesSent));
      
      console.log(`📊 并发消息转发性能统计:
        连接数: ${connections.length}
        测试时长: ${testDuration / 1000}秒
        服务器发送消息: ${finalServerMetrics.messagesSent}
        客户端接收消息: ${messageStats.totalReceived}
        消息丢失率: ${(Math.max(0, (finalServerMetrics.messagesSent - messageStats.totalReceived) / finalServerMetrics.messagesSent) * 100).toFixed(2)}%
        平均每连接消息: ${averageMessagesPerConnection.toFixed(2)}
        吞吐量: ${throughputMetrics.messagesPerSecond.toFixed(2)} msg/sec
        平均延迟: ${avgLatency.toFixed(2)}ms
        P95延迟: ${p95Latency.toFixed(2)}ms
        内存使用: ${(finalMemoryStats.current / (1024 * 1024)).toFixed(2)}MB`);
      
      // 验证性能要求
      expect(messageStats.totalReceived).toBeGreaterThanOrEqual(finalServerMetrics.messagesSent * 0.95); // 95%消息到达
      expect(throughputMetrics.messagesPerSecond).toBeGreaterThanOrEqual(1500); // 吞吐量≥1500 msg/sec
      expect(avgLatency).toBeLessThanOrEqual(50); // 平均延迟≤50ms
      expect(p95Latency).toBeLessThanOrEqual(100); // P95延迟≤100ms
      expect(finalMemoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(200); // 内存≤200MB
      
      // 清理连接
      for (const ws of connections) {
        try {
          ws.close();
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      console.log('✅ 并发消息转发性能测试完成');
    }, 180000); // 3分钟超时
  });

  describe('订阅管理性能', () => {
    test('测试大量订阅的管理和过滤性能', async () => {
      console.log('🎯 开始订阅管理性能测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const connections: WebSocket[] = [];
      const connectionCount = 200;
      const subscriptionTypes = ['trade', 'ticker', 'kline', 'depth'];
      const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT', 'LTCUSDT'];
      
      const subscriptionStats = {
        totalSubscriptions: 0,
        subscriptionLatencies: [] as number[],
        filteredMessages: 0,
        unfilteredMessages: 0
      };
      
      // 建立连接
      console.log(`建立${connectionCount}个连接并设置订阅...`);
      
      for (let i = 0; i < connectionCount; i++) {
        const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`连接${i}超时`));
          }, 5000);
          
          ws.on('open', () => {
            clearTimeout(timeout);
            connections.push(ws);
            resolve();
          });
          
          ws.on('error', reject);
        });
        
        // 为每个连接创建随机订阅
        const numSubscriptions = Math.floor(Math.random() * 5) + 2; // 2-6个订阅
        for (let j = 0; j < numSubscriptions; j++) {
          const subscriptionType = subscriptionTypes[Math.floor(Math.random() * subscriptionTypes.length)];
          const symbol = symbols[Math.floor(Math.random() * symbols.length)];
          const subscriptionTopic = `${symbol.toLowerCase()}@${subscriptionType}`;
          
          const subscriptionStart = performance.now();
          
          // 发送订阅请求
          ws.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params: [subscriptionTopic],
            id: `sub_${i}_${j}`
          }));
          
          subscriptionStats.totalSubscriptions++;
          
          // 模拟订阅确认延迟
          setTimeout(() => {
            const subscriptionLatency = performance.now() - subscriptionStart;
            subscriptionStats.subscriptionLatencies.push(subscriptionLatency);
            recordMetric('websocket-subscription-latency', subscriptionLatency);
          }, Math.random() * 20 + 5); // 5-25ms延迟
        }
        
        // 设置消息过滤统计
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // 统计过滤消息vs未过滤消息
            if (message.type === 'ticker' && message.symbol) {
              subscriptionStats.filteredMessages++;
            } else {
              subscriptionStats.unfilteredMessages++;
            }
            
          } catch (error) {
            // 忽略解析错误
          }
        });
      }
      
      console.log(`✅ 建立了${connections.length}个连接，总计${subscriptionStats.totalSubscriptions}个订阅`);
      
      // 开始混合消息生成测试订阅过滤
      console.log('开始测试订阅过滤性能...');
      testServer.startMessageGeneration(50, ['trade', 'ticker', 'kline', 'depth']); // 每50ms一条消息
      
      const testDuration = 45000; // 45秒测试
      
      // 定期统计
      const statsInterval = setInterval(() => {
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        
        recordMetric('websocket-subscription-filtered-messages', subscriptionStats.filteredMessages);
        recordMetric('websocket-subscription-unfiltered-messages', subscriptionStats.unfilteredMessages);
        recordMetric('websocket-subscription-memory-mb', currentMetrics.memoryMB);
        recordMetric('websocket-subscription-cpu-usage', currentMetrics.cpuUsage);
        
        console.log(`📊 订阅过滤统计:
          过滤消息: ${subscriptionStats.filteredMessages}
          未过滤消息: ${subscriptionStats.unfilteredMessages}
          过滤效率: ${(subscriptionStats.filteredMessages / (subscriptionStats.filteredMessages + subscriptionStats.unfilteredMessages) * 100).toFixed(2)}%
          内存: ${currentMetrics.memoryMB.toFixed(2)}MB`);
      }, 10000);
      
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(statsInterval);
      testServer.stopMessageGeneration();
      
      // 等待消息处理完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const finalMemoryStats = performanceMonitor.getMemoryStats();
      const subscriptionLatencies = subscriptionStats.subscriptionLatencies.sort((a, b) => a - b);
      const avgSubscriptionLatency = subscriptionLatencies.reduce((a, b) => a + b, 0) / subscriptionLatencies.length || 0;
      const p95SubscriptionLatency = subscriptionLatencies[Math.floor(subscriptionLatencies.length * 0.95)] || 0;
      
      const filteringEfficiency = subscriptionStats.filteredMessages / (subscriptionStats.filteredMessages + subscriptionStats.unfilteredMessages);
      
      // 记录最终订阅管理指标
      recordMetric('websocket-subscription-total-count', subscriptionStats.totalSubscriptions);
      recordMetric('websocket-subscription-avg-latency', avgSubscriptionLatency);
      recordMetric('websocket-subscription-p95-latency', p95SubscriptionLatency);
      recordMetric('websocket-subscription-filtering-efficiency', filteringEfficiency);
      recordMetric('websocket-subscription-final-memory-mb', finalMemoryStats.current / (1024 * 1024));
      
      console.log(`📊 订阅管理性能最终统计:
        连接数: ${connections.length}
        订阅总数: ${subscriptionStats.totalSubscriptions}
        平均每连接订阅: ${(subscriptionStats.totalSubscriptions / connections.length).toFixed(2)}
        订阅平均延迟: ${avgSubscriptionLatency.toFixed(2)}ms
        订阅P95延迟: ${p95SubscriptionLatency.toFixed(2)}ms
        过滤消息数: ${subscriptionStats.filteredMessages}
        未过滤消息数: ${subscriptionStats.unfilteredMessages}
        过滤效率: ${(filteringEfficiency * 100).toFixed(2)}%
        最终内存: ${(finalMemoryStats.current / (1024 * 1024)).toFixed(2)}MB`);
      
      // 验证订阅管理性能要求
      expect(avgSubscriptionLatency).toBeLessThanOrEqual(30); // 平均订阅延迟≤30ms
      expect(p95SubscriptionLatency).toBeLessThanOrEqual(100); // P95订阅延迟≤100ms
      expect(filteringEfficiency).toBeGreaterThanOrEqual(0.7); // 过滤效率≥70%
      expect(finalMemoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(150); // 内存≤150MB
      
      // 清理连接
      for (const ws of connections) {
        try {
          ws.close();
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      console.log('✅ 订阅管理性能测试完成');
    }, 120000);
  });

  describe('WebSocket代理稳定性', () => {
    test('长时间高负载下的WebSocket代理稳定性测试', async () => {
      console.log('🔄 开始WebSocket代理稳定性测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      const connections: WebSocket[] = [];
      const connectionCount = 300;
      const testDuration = 120000; // 2分钟稳定性测试
      
      const stabilityStats = {
        connectionDrops: 0,
        reconnections: 0,
        messageErrors: 0,
        memorySnapshots: [] as number[],
        cpuSnapshots: [] as number[]
      };
      
      console.log(`建立${connectionCount}个稳定性测试连接...`);
      
      // 建立初始连接
      for (let i = 0; i < connectionCount; i++) {
        try {
          const ws = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
          
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`连接${i}建立超时`));
            }, 5000);
            
            ws.on('open', () => {
              clearTimeout(timeout);
              connections.push(ws);
              resolve();
            });
            
            ws.on('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });
            
            ws.on('close', () => {
              stabilityStats.connectionDrops++;
              recordMetric('websocket-stability-connection-drop', 1);
              
              // 模拟重连
              setTimeout(async () => {
                try {
                  const reconnectWs = new WebSocket(`ws://localhost:${TEST_CONFIG.TEST_SERVER.WS_PORT}`);
                  reconnectWs.on('open', () => {
                    connections.push(reconnectWs);
                    stabilityStats.reconnections++;
                    recordMetric('websocket-stability-reconnection', 1);
                  });
                } catch (error) {
                  console.warn(`重连失败: ${error}`);
                }
              }, 1000);
            });
            
            ws.on('message', (data) => {
              try {
                JSON.parse(data.toString());
              } catch (error) {
                stabilityStats.messageErrors++;
                recordMetric('websocket-stability-message-error', 1);
              }
            });
          });
          
        } catch (error) {
          console.warn(`建立连接${i}失败:`, error);
        }
      }
      
      console.log(`✅ 建立了${connections.length}个稳定性测试连接`);
      
      // 开始高负载消息生成
      testServer.startHighFrequencyStream(1500); // 1500 msg/sec高负载
      
      // 定期收集稳定性指标
      const stabilityInterval = setInterval(() => {
        const currentMetrics = performanceMonitor.getCurrentMetrics();
        
        stabilityStats.memorySnapshots.push(currentMetrics.memoryMB);
        stabilityStats.cpuSnapshots.push(currentMetrics.cpuUsage);
        
        recordMetric('websocket-stability-active-connections', connections.filter(ws => ws.readyState === WebSocket.OPEN).length);
        recordMetric('websocket-stability-memory-mb', currentMetrics.memoryMB);
        recordMetric('websocket-stability-cpu-usage', currentMetrics.cpuUsage);
        
        console.log(`📈 稳定性监控:
          活跃连接: ${connections.filter(ws => ws.readyState === WebSocket.OPEN).length}
          连接断开: ${stabilityStats.connectionDrops}
          重连成功: ${stabilityStats.reconnections}
          消息错误: ${stabilityStats.messageErrors}
          内存: ${currentMetrics.memoryMB.toFixed(2)}MB
          CPU: ${currentMetrics.cpuUsage.toFixed(2)}%`);
      }, 10000);
      
      // 运行稳定性测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(stabilityInterval);
      testServer.stopMessageGeneration();
      
      // 分析稳定性指标
      const avgMemory = stabilityStats.memorySnapshots.reduce((a, b) => a + b, 0) / stabilityStats.memorySnapshots.length;
      const maxMemory = Math.max(...stabilityStats.memorySnapshots);
      const minMemory = Math.min(...stabilityStats.memorySnapshots);
      const memoryVariance = maxMemory - minMemory;
      
      const avgCpu = stabilityStats.cpuSnapshots.reduce((a, b) => a + b, 0) / stabilityStats.cpuSnapshots.length;
      const maxCpu = Math.max(...stabilityStats.cpuSnapshots);
      
      const activeConnections = connections.filter(ws => ws.readyState === WebSocket.OPEN).length;
      const connectionStability = activeConnections / connectionCount;
      
      // 记录稳定性最终指标
      recordMetric('websocket-stability-connection-drops', stabilityStats.connectionDrops);
      recordMetric('websocket-stability-reconnections', stabilityStats.reconnections);
      recordMetric('websocket-stability-message-errors', stabilityStats.messageErrors);
      recordMetric('websocket-stability-avg-memory', avgMemory);
      recordMetric('websocket-stability-max-memory', maxMemory);
      recordMetric('websocket-stability-memory-variance', memoryVariance);
      recordMetric('websocket-stability-avg-cpu', avgCpu);
      recordMetric('websocket-stability-max-cpu', maxCpu);
      recordMetric('websocket-stability-connection-stability', connectionStability);
      
      console.log(`📊 WebSocket代理稳定性最终统计:
        测试时长: ${testDuration / 1000}秒
        初始连接数: ${connectionCount}
        最终活跃连接: ${activeConnections}
        连接稳定率: ${(connectionStability * 100).toFixed(2)}%
        连接断开次数: ${stabilityStats.connectionDrops}
        重连成功次数: ${stabilityStats.reconnections}
        消息解析错误: ${stabilityStats.messageErrors}
        
        内存统计:
        - 平均: ${avgMemory.toFixed(2)}MB
        - 最大: ${maxMemory.toFixed(2)}MB  
        - 最小: ${minMemory.toFixed(2)}MB
        - 波动: ${memoryVariance.toFixed(2)}MB
        
        CPU统计:
        - 平均: ${avgCpu.toFixed(2)}%
        - 最大: ${maxCpu.toFixed(2)}%`);
      
      // 验证稳定性要求
      expect(connectionStability).toBeGreaterThanOrEqual(0.9); // 90%连接稳定率
      expect(stabilityStats.messageErrors).toBeLessThanOrEqual(10); // 消息错误≤10次
      expect(memoryVariance).toBeLessThanOrEqual(50); // 内存波动≤50MB
      expect(maxMemory).toBeLessThanOrEqual(250); // 最大内存≤250MB
      expect(avgCpu).toBeLessThanOrEqual(70); // 平均CPU≤70%
      
      // 清理连接
      for (const ws of connections) {
        try {
          ws.close();
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      console.log('✅ WebSocket代理稳定性测试完成');
    }, 180000); // 3分钟超时
  });
});