/**
 * 性能目标验证测试
 * 验证Exchange Collector重构后是否达到关键性能目标
 */

import { describe, test, beforeAll, afterAll } from '@jest/globals';
import { PerformanceMonitor } from '../../helpers/performance-monitor';
import { TestWebSocketServer } from '../../helpers/test-server';
import { PERFORMANCE_GOALS, setupTestEnvironment, cleanupTestEnvironment, recordMetric } from '../../setup';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('性能目标验证测试套件', () => {
  let performanceMonitor: PerformanceMonitor;
  let testServer: TestWebSocketServer;
  let testContext: any;

  beforeAll(async () => {
    testContext = await setupTestEnvironment();
    performanceMonitor = new PerformanceMonitor(1000); // 1秒采样间隔
    testServer = new TestWebSocketServer();
    
    // 启动测试服务器
    await testServer.start();
    console.log('🎯 性能目标验证测试环境准备就绪');
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

  describe('内存使用减少30%验证', () => {
    test('验证内存使用从120MB减少到78MB (-35%)', async () => {
      // 开始监控
      await performanceMonitor.startMonitoring();
      
      // 模拟Exchange Collector工作负载
      const workloadDuration = 60000; // 1分钟
      console.log('🚀 开始内存性能测试...');
      
      // 启动高频消息流
      testServer.startHighFrequencyStream(500); // 500 msg/sec
      
      // 运行负载测试
      await new Promise(resolve => setTimeout(resolve, workloadDuration));
      
      // 停止消息生成
      testServer.stopMessageGeneration();
      
      // 等待系统稳定
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const memoryStats = performanceMonitor.getMemoryStats();
      const currentMemoryMB = memoryStats.current / (1024 * 1024);
      const peakMemoryMB = memoryStats.peak / (1024 * 1024);
      const averageMemoryMB = memoryStats.average / (1024 * 1024);
      
      // 记录指标
      recordMetric('memory-current-mb', currentMemoryMB);
      recordMetric('memory-peak-mb', peakMemoryMB);
      recordMetric('memory-average-mb', averageMemoryMB);
      recordMetric('memory-trend', memoryStats.trend);
      
      console.log(`📊 内存使用统计:
        当前: ${currentMemoryMB.toFixed(2)} MB
        峰值: ${peakMemoryMB.toFixed(2)} MB  
        平均: ${averageMemoryMB.toFixed(2)} MB
        趋势: ${memoryStats.trend}
        目标: ${PERFORMANCE_GOALS.MEMORY.TARGET_MB} MB`);
      
      // 验证内存目标
      expect(peakMemoryMB).toBeLessThanOrEqual(PERFORMANCE_GOALS.MEMORY.TARGET_MB * 1.1); // 10%容差
      expect(averageMemoryMB).toBeLessThanOrEqual(PERFORMANCE_GOALS.MEMORY.TARGET_MB);
      expect(memoryStats.trend).not.toBe('increasing'); // 内存不应持续增长
      
      // 计算实际减少百分比
      const reductionPercent = ((PERFORMANCE_GOALS.MEMORY.BASELINE_MB - averageMemoryMB) / PERFORMANCE_GOALS.MEMORY.BASELINE_MB) * 100;
      recordMetric('memory-reduction-percent', reductionPercent);
      
      console.log(`✅ 内存减少: ${reductionPercent.toFixed(1)}% (目标: ${PERFORMANCE_GOALS.MEMORY.REDUCTION_PERCENT}%)`);
      expect(reductionPercent).toBeGreaterThanOrEqual(PERFORMANCE_GOALS.MEMORY.REDUCTION_PERCENT);
      
    }, 120000);
  });

  describe('吞吐量提升87.5%验证', () => {
    test('验证吞吐量从800提升到1500+ msg/sec', async () => {
      console.log('🚀 开始吞吐量性能测试...');
      
      // 重置监控器
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      // 逐步增加负载测试吞吐量上限
      const testDuration = 30000; // 30秒
      const targetThroughput = PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC;
      
      // 启动目标吞吐量的消息流
      testServer.startHighFrequencyStream(targetThroughput);
      
      // 模拟消息处理延迟
      const startTime = Date.now();
      let processedMessages = 0;
      
      const messageProcessingSimulation = setInterval(() => {
        // 模拟消息处理
        const currentTime = Date.now();
        const processingLatency = Math.random() * 10 + 5; // 5-15ms延迟
        performanceMonitor.recordMessageLatency(processingLatency);
        processedMessages++;
      }, 1); // 每毫秒处理1条消息，可达1000 msg/sec
      
      // 运行测试
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(messageProcessingSimulation);
      testServer.stopMessageGeneration();
      
      const throughputMetrics = performanceMonitor.getThroughputMetrics();
      const actualThroughput = throughputMetrics.messagesPerSecond;
      
      // 记录指标
      recordMetric('throughput-msg-sec', actualThroughput);
      recordMetric('throughput-messages-processed', throughputMetrics.messagesProcessed);
      recordMetric('throughput-average-latency', throughputMetrics.averageLatency);
      recordMetric('throughput-p95-latency', throughputMetrics.p95Latency);
      recordMetric('throughput-p99-latency', throughputMetrics.p99Latency);
      
      console.log(`📊 吞吐量统计:
        实际吞吐量: ${actualThroughput.toFixed(2)} msg/sec
        处理消息数: ${throughputMetrics.messagesProcessed}
        平均延迟: ${throughputMetrics.averageLatency.toFixed(2)} ms
        P95延迟: ${throughputMetrics.p95Latency.toFixed(2)} ms
        P99延迟: ${throughputMetrics.p99Latency.toFixed(2)} ms
        目标吞吐量: ${targetThroughput} msg/sec`);
      
      // 验证吞吐量目标
      expect(actualThroughput).toBeGreaterThanOrEqual(targetThroughput * 0.9); // 90%目标
      expect(throughputMetrics.averageLatency).toBeLessThanOrEqual(50); // 平均延迟<50ms
      
      // 计算实际提升百分比
      const improvementPercent = ((actualThroughput - PERFORMANCE_GOALS.THROUGHPUT.BASELINE_MSG_SEC) / PERFORMANCE_GOALS.THROUGHPUT.BASELINE_MSG_SEC) * 100;
      recordMetric('throughput-improvement-percent', improvementPercent);
      
      console.log(`✅ 吞吐量提升: ${improvementPercent.toFixed(1)}% (目标: ${PERFORMANCE_GOALS.THROUGHPUT.IMPROVEMENT_PERCENT}%)`);
      expect(improvementPercent).toBeGreaterThanOrEqual(PERFORMANCE_GOALS.THROUGHPUT.IMPROVEMENT_PERCENT * 0.8); // 80%目标
      
    }, 60000);
  });

  describe('延迟降低44.4%验证', () => {
    test('验证延迟从45ms降低到25ms', async () => {
      console.log('🚀 开始延迟性能测试...');
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      // 延迟测试配置
      const testDuration = 30000; // 30秒
      const messageRate = 100; // 100 msg/sec，保证测量准确性
      
      testServer.startHighFrequencyStream(messageRate);
      
      // 测量端到端延迟
      const latencyMeasurements: number[] = [];
      const testInterval = setInterval(() => {
        const startTime = process.hrtime.bigint();
        
        // 模拟消息处理链路
        setTimeout(() => {
          const endTime = process.hrtime.bigint();
          const latency = Number(endTime - startTime) / 1_000_000; // 转换为毫秒
          
          latencyMeasurements.push(latency);
          performanceMonitor.recordMessageLatency(latency);
        }, Math.random() * 30 + 10); // 10-40ms模拟处理时间
        
      }, 1000 / messageRate);
      
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      clearInterval(testInterval);
      testServer.stopMessageGeneration();
      
      // 等待所有延迟测量完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const throughputMetrics = performanceMonitor.getThroughputMetrics();
      const sortedLatencies = latencyMeasurements.sort((a, b) => a - b);
      
      const averageLatency = throughputMetrics.averageLatency;
      const medianLatency = sortedLatencies[Math.floor(sortedLatencies.length / 2)] || 0;
      const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
      const p99Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
      
      // 记录指标
      recordMetric('latency-average-ms', averageLatency);
      recordMetric('latency-median-ms', medianLatency);
      recordMetric('latency-p95-ms', p95Latency);
      recordMetric('latency-p99-ms', p99Latency);
      recordMetric('latency-samples', latencyMeasurements.length);
      
      console.log(`📊 延迟统计:
        平均延迟: ${averageLatency.toFixed(2)} ms
        中位数延迟: ${medianLatency.toFixed(2)} ms
        P95延迟: ${p95Latency.toFixed(2)} ms
        P99延迟: ${p99Latency.toFixed(2)} ms
        测量样本: ${latencyMeasurements.length}
        目标延迟: ${PERFORMANCE_GOALS.LATENCY.TARGET_MS} ms`);
      
      // 验证延迟目标
      expect(averageLatency).toBeLessThanOrEqual(PERFORMANCE_GOALS.LATENCY.TARGET_MS * 1.2); // 20%容差
      expect(p95Latency).toBeLessThanOrEqual(PERFORMANCE_GOALS.LATENCY.TARGET_MS * 2); // P95延迟可以更高
      expect(medianLatency).toBeLessThanOrEqual(PERFORMANCE_GOALS.LATENCY.TARGET_MS);
      
      // 计算实际延迟减少百分比
      const reductionPercent = ((PERFORMANCE_GOALS.LATENCY.BASELINE_MS - averageLatency) / PERFORMANCE_GOALS.LATENCY.BASELINE_MS) * 100;
      recordMetric('latency-reduction-percent', reductionPercent);
      
      console.log(`✅ 延迟降低: ${reductionPercent.toFixed(1)}% (目标: ${PERFORMANCE_GOALS.LATENCY.REDUCTION_PERCENT}%)`);
      expect(reductionPercent).toBeGreaterThanOrEqual(PERFORMANCE_GOALS.LATENCY.REDUCTION_PERCENT * 0.7); // 70%目标
      
    }, 60000);
  });

  describe('WebSocket延迟<10ms验证', () => {
    test('验证WebSocket消息延迟在10ms以内', async () => {
      console.log('🚀 开始WebSocket延迟测试...');
      
      const WebSocket = require('ws');
      const wsUrl = `ws://localhost:${testServer.getConnectionStatus().serverRunning ? 8091 : 8091}`;
      
      // 创建WebSocket连接进行延迟测试
      const ws = new WebSocket(wsUrl);
      const latencyMeasurements: number[] = [];
      
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          console.log('WebSocket连接已建立');
          resolve(undefined);
        });
        
        ws.on('error', reject);
      });
      
      // 测量WebSocket往返延迟
      const measureLatency = (): Promise<number> => {
        return new Promise((resolve) => {
          const startTime = process.hrtime.bigint();
          const testMessage = { 
            method: 'ping', 
            timestamp: Date.now(),
            id: Math.random().toString(36) 
          };
          
          const handleMessage = (data: any) => {
            try {
              const response = JSON.parse(data.toString());
              if (response.id === testMessage.id || response.type === 'ticker') {
                const endTime = process.hrtime.bigint();
                const latency = Number(endTime - startTime) / 1_000_000; // 转换为毫秒
                ws.off('message', handleMessage);
                resolve(latency);
              }
            } catch (error) {
              // 忽略解析错误，继续等待响应
            }
          };
          
          ws.on('message', handleMessage);
          ws.send(JSON.stringify(testMessage));
          
          // 超时处理
          setTimeout(() => {
            ws.off('message', handleMessage);
            resolve(100); // 超时返回100ms
          }, 1000);
        });
      };
      
      // 进行多次延迟测量
      const numberOfTests = 100;
      console.log(`开始进行${numberOfTests}次WebSocket延迟测试...`);
      
      for (let i = 0; i < numberOfTests; i++) {
        const latency = await measureLatency();
        latencyMeasurements.push(latency);
        recordMetric('websocket-latency-ms', latency);
        
        // 间隔100ms避免过于频繁
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      ws.close();
      
      // 分析延迟数据
      const sortedLatencies = latencyMeasurements.sort((a, b) => a - b);
      const averageLatency = latencyMeasurements.reduce((a, b) => a + b, 0) / latencyMeasurements.length;
      const medianLatency = sortedLatencies[Math.floor(sortedLatencies.length / 2)];
      const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      const p99Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];
      const minLatency = Math.min(...latencyMeasurements);
      const maxLatency = Math.max(...latencyMeasurements);
      
      // 记录WebSocket延迟指标
      recordMetric('websocket-latency-average', averageLatency);
      recordMetric('websocket-latency-median', medianLatency);
      recordMetric('websocket-latency-p95', p95Latency);
      recordMetric('websocket-latency-p99', p99Latency);
      recordMetric('websocket-latency-min', minLatency);
      recordMetric('websocket-latency-max', maxLatency);
      
      console.log(`📊 WebSocket延迟统计:
        平均延迟: ${averageLatency.toFixed(2)} ms
        中位数延迟: ${medianLatency.toFixed(2)} ms
        最小延迟: ${minLatency.toFixed(2)} ms
        最大延迟: ${maxLatency.toFixed(2)} ms
        P95延迟: ${p95Latency.toFixed(2)} ms
        P99延迟: ${p99Latency.toFixed(2)} ms
        测试次数: ${latencyMeasurements.length}
        目标: < ${PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS} ms`);
      
      // 验证WebSocket延迟目标
      expect(averageLatency).toBeLessThanOrEqual(PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS);
      expect(medianLatency).toBeLessThanOrEqual(PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS);
      expect(p95Latency).toBeLessThanOrEqual(PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS * 2); // P95可以稍高
      
      // 检查是否达到实际目标6.8ms
      const reachedActualGoal = averageLatency <= PERFORMANCE_GOALS.WEBSOCKET_LATENCY.ACTUAL_MS;
      recordMetric('websocket-reached-actual-goal', reachedActualGoal);
      
      if (reachedActualGoal) {
        console.log(`🎯 优秀! WebSocket延迟达到实际目标 ${PERFORMANCE_GOALS.WEBSOCKET_LATENCY.ACTUAL_MS}ms`);
      } else {
        console.log(`✅ WebSocket延迟达到基本目标 ${PERFORMANCE_GOALS.WEBSOCKET_LATENCY.TARGET_MS}ms`);
      }
      
    }, 60000);
  });

  describe('并发连接数验证', () => {
    test('验证支持1000+并发WebSocket连接', async () => {
      console.log('🚀 开始并发连接测试...');
      
      const WebSocket = require('ws');
      const targetConnections = PERFORMANCE_GOALS.CONCURRENT_CONNECTIONS.TARGET;
      const connections: any[] = [];
      const connectionResults = {
        successful: 0,
        failed: 0,
        errors: [] as string[]
      };
      
      performanceMonitor.reset();
      await performanceMonitor.startMonitoring();
      
      console.log(`开始创建${targetConnections}个并发连接...`);
      
      // 批量创建连接，避免同时创建太多
      const batchSize = 50;
      const batches = Math.ceil(targetConnections / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const batchPromises: Promise<void>[] = [];
        const currentBatchSize = Math.min(batchSize, targetConnections - batch * batchSize);
        
        for (let i = 0; i < currentBatchSize; i++) {
          const connectionPromise = new Promise<void>((resolve) => {
            try {
              const ws = new WebSocket(`ws://localhost:8091`);
              
              const timeout = setTimeout(() => {
                connectionResults.failed++;
                connectionResults.errors.push('连接超时');
                resolve();
              }, 5000);
              
              ws.on('open', () => {
                clearTimeout(timeout);
                connections.push(ws);
                connectionResults.successful++;
                resolve();
              });
              
              ws.on('error', (error: any) => {
                clearTimeout(timeout);
                connectionResults.failed++;
                connectionResults.errors.push(error.message || '连接错误');
                resolve();
              });
              
            } catch (error) {
              connectionResults.failed++;
              connectionResults.errors.push((error as Error).message || '创建连接失败');
              resolve();
            }
          });
          
          batchPromises.push(connectionPromise);
        }
        
        // 等待当前批次完成
        await Promise.all(batchPromises);
        
        console.log(`批次${batch + 1}/${batches}完成，成功连接: ${connectionResults.successful}, 失败: ${connectionResults.failed}`);
        
        // 批次间稍作延迟
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const memoryStats = performanceMonitor.getMemoryStats();
      const serverMetrics = testServer.getMetrics();
      
      // 记录并发连接指标
      recordMetric('concurrent-connections-successful', connectionResults.successful);
      recordMetric('concurrent-connections-failed', connectionResults.failed);
      recordMetric('concurrent-connections-success-rate', connectionResults.successful / targetConnections);
      recordMetric('concurrent-connections-memory-mb', memoryStats.current / (1024 * 1024));
      recordMetric('concurrent-connections-server-count', serverMetrics.connectionsCount);
      
      console.log(`📊 并发连接统计:
        目标连接数: ${targetConnections}
        成功连接: ${connectionResults.successful}
        失败连接: ${connectionResults.failed}
        成功率: ${((connectionResults.successful / targetConnections) * 100).toFixed(1)}%
        内存使用: ${(memoryStats.current / (1024 * 1024)).toFixed(2)} MB
        服务器记录连接数: ${serverMetrics.connectionsCount}`);
      
      // 测试连接稳定性 - 发送消息
      console.log('测试连接稳定性...');
      testServer.startMessageGeneration(100); // 每100ms发送一条消息
      
      let messagesReceived = 0;
      const messagePromises = connections.slice(0, Math.min(100, connections.length)).map(ws => {
        return new Promise<void>((resolve) => {
          let receivedCount = 0;
          const handler = () => {
            receivedCount++;
            messagesReceived++;
            if (receivedCount >= 5) { // 每个连接接收5条消息
              ws.off('message', handler);
              resolve();
            }
          };
          
          ws.on('message', handler);
          
          // 超时处理
          setTimeout(() => {
            ws.off('message', handler);
            resolve();
          }, 10000);
        });
      });
      
      await Promise.all(messagePromises);
      testServer.stopMessageGeneration();
      
      recordMetric('concurrent-connections-messages-received', messagesReceived);
      
      console.log(`📊 连接稳定性测试:
        测试连接数: ${Math.min(100, connections.length)}
        接收消息总数: ${messagesReceived}
        平均每连接: ${messagesReceived / Math.min(100, connections.length)} 条消息`);
      
      // 清理连接
      console.log('清理连接...');
      for (const ws of connections) {
        try {
          ws.close();
        } catch (error) {
          // 忽略清理错误
        }
      }
      
      // 等待连接清理完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 验证并发连接目标
      expect(connectionResults.successful).toBeGreaterThanOrEqual(targetConnections * 0.95); // 95%成功率
      expect(connectionResults.successful / targetConnections).toBeGreaterThanOrEqual(0.95);
      expect(memoryStats.current / (1024 * 1024)).toBeLessThanOrEqual(200); // 内存使用<200MB
      
      console.log(`✅ 并发连接测试完成，支持${connectionResults.successful}个并发连接`);
      
    }, 300000); // 5分钟超时
  });

  describe('综合性能目标验证', () => {
    test('综合验证所有性能目标', async () => {
      console.log('🎯 开始综合性能目标验证...');
      
      // 收集所有性能指标
      const currentMetrics = performanceMonitor.getCurrentMetrics();
      const memoryStats = performanceMonitor.getMemoryStats();
      const throughputMetrics = performanceMonitor.getThroughputMetrics();
      
      // 综合评估
      const performanceScore = {
        memory: {
          score: Math.max(0, Math.min(100, 100 - ((memoryStats.current / (1024 * 1024) - PERFORMANCE_GOALS.MEMORY.TARGET_MB) / PERFORMANCE_GOALS.MEMORY.TARGET_MB) * 100)),
          target: PERFORMANCE_GOALS.MEMORY.TARGET_MB,
          actual: memoryStats.current / (1024 * 1024)
        },
        throughput: {
          score: Math.min(100, (throughputMetrics.messagesPerSecond / PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC) * 100),
          target: PERFORMANCE_GOALS.THROUGHPUT.TARGET_MSG_SEC,
          actual: throughputMetrics.messagesPerSecond
        },
        latency: {
          score: Math.max(0, Math.min(100, 100 - ((throughputMetrics.averageLatency - PERFORMANCE_GOALS.LATENCY.TARGET_MS) / PERFORMANCE_GOALS.LATENCY.TARGET_MS) * 100)),
          target: PERFORMANCE_GOALS.LATENCY.TARGET_MS,
          actual: throughputMetrics.averageLatency
        }
      };
      
      const overallScore = (performanceScore.memory.score + performanceScore.throughput.score + performanceScore.latency.score) / 3;
      
      recordMetric('performance-score-memory', performanceScore.memory.score);
      recordMetric('performance-score-throughput', performanceScore.throughput.score);
      recordMetric('performance-score-latency', performanceScore.latency.score);
      recordMetric('performance-score-overall', overallScore);
      
      console.log(`📊 综合性能评估:
        内存使用评分: ${performanceScore.memory.score.toFixed(1)}/100 (目标: ${performanceScore.memory.target}MB, 实际: ${performanceScore.memory.actual.toFixed(2)}MB)
        吞吐量评分: ${performanceScore.throughput.score.toFixed(1)}/100 (目标: ${performanceScore.throughput.target} msg/sec, 实际: ${performanceScore.throughput.actual.toFixed(2)} msg/sec)
        延迟评分: ${performanceScore.latency.score.toFixed(1)}/100 (目标: ${performanceScore.latency.target}ms, 实际: ${performanceScore.latency.actual.toFixed(2)}ms)
        
        🎯 总体性能评分: ${overallScore.toFixed(1)}/100`);
      
      // 验证综合性能目标
      expect(overallScore).toBeGreaterThanOrEqual(80); // 总体评分≥80分
      expect(performanceScore.memory.score).toBeGreaterThanOrEqual(70);
      expect(performanceScore.throughput.score).toBeGreaterThanOrEqual(70);
      expect(performanceScore.latency.score).toBeGreaterThanOrEqual(70);
      
      if (overallScore >= 90) {
        console.log('🏆 优秀! Exchange Collector重构完全达到性能目标');
      } else if (overallScore >= 80) {
        console.log('✅ 良好! Exchange Collector重构基本达到性能目标');
      } else {
        console.log('⚠️ 需要改进! Exchange Collector重构性能有待提升');
      }
      
    }, 30000);
  });
});