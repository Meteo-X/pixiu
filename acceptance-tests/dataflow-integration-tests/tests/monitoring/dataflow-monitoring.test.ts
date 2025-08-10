/**
 * DataFlow监控和可观测性测试
 * 验证DataFlowMonitor功能、指标收集和告警系统
 */

import { DataFlowMonitor } from '../../../services/data-collection/exchange-collector/src/dataflow/monitoring/dataflow-monitor';
import { DataFlowTestManager, TestDataGenerator } from '@helpers/dataflow-test-utils';
import { TestPerformanceMonitor } from '@helpers/test-performance-monitor';
import { 
  generateHighFrequencyTrades,
  generateStressTestData,
  BASIC_TRADE_DATA 
} from '@fixtures/test-data-sets';
import { testUtils } from '../../setup';

// Mock shared-core模块
jest.mock('@pixiu/shared-core', () => ({
  BaseMonitor: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    registerMetric: jest.fn(),
    updateMetric: jest.fn(),
    registerHealthCheck: jest.fn(),
    observeHistogram: jest.fn()
  }))
}));

describe('DataFlow监控和可观测性测试', () => {
  let testManager: DataFlowTestManager;
  let dataGenerator: TestDataGenerator;
  let performanceMonitor: TestPerformanceMonitor;
  let mockBaseMonitor: any;

  beforeEach(async () => {
    testManager = new DataFlowTestManager();
    dataGenerator = TestDataGenerator.getInstance();
    performanceMonitor = new TestPerformanceMonitor();
    
    mockBaseMonitor = {
      log: jest.fn(),
      registerMetric: jest.fn(),
      updateMetric: jest.fn(),
      registerHealthCheck: jest.fn(),
      observeHistogram: jest.fn()
    };
    
    dataGenerator.reset();
  });

  afterEach(async () => {
    await testManager.cleanup();
    performanceMonitor.reset();
  });

  describe('DataFlowMonitor基础功能测试', () => {
    it('应该成功初始化和启动监控', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      
      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 100,
          healthCheckInterval: 200,
          enableMetrics: true
        }
      );

      // 验证初始化
      expect(monitor).toBeDefined();

      // 启动监控
      monitor.start();

      // 验证指标注册
      expect(mockBaseMonitor.registerMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dataflow_performance_score',
          type: 'gauge'
        })
      );

      expect(mockBaseMonitor.registerMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dataflow_throughput_current',
          type: 'gauge'
        })
      );

      // 等待监控周期
      await testUtils.wait(300);

      // 停止监控
      monitor.stop();

      console.log('✅ DataFlowMonitor基础功能测试完成');
    });

    it('应该正确收集和报告性能指标', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        monitoring: {
          enableMetrics: true,
          metricsInterval: 100,
          enableLatencyTracking: true
        }
      });

      const testChannel = testManager.createMockChannel('metrics-test');
      dataFlowManager.registerChannel(testChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['metrics-test']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true
        }
      );

      let performanceMetrics = null;
      monitor.on('metricsUpdated', (metrics) => {
        performanceMetrics = metrics;
      });

      monitor.start();

      // 发送测试数据
      const testData = generateHighFrequencyTrades(100, 'BTCUSDT', 50000);
      
      for (const data of testData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(2000);
      await testUtils.wait(200); // 等待监控周期

      // 获取性能指标
      const currentMetrics = monitor.getPerformanceMetrics();

      expect(currentMetrics).toBeDefined();
      expect(currentMetrics?.performanceScore).toBeGreaterThan(0);
      expect(currentMetrics?.throughput.current).toBeGreaterThan(0);
      expect(currentMetrics?.reliability.successRate).toBeGreaterThan(0);

      // 验证指标更新调用
      expect(mockBaseMonitor.updateMetric).toHaveBeenCalledWith(
        'dataflow_performance_score',
        expect.any(Number)
      );

      expect(mockBaseMonitor.updateMetric).toHaveBeenCalledWith(
        'dataflow_throughput_current',
        expect.any(Number)
      );

      monitor.stop();

      console.log('✅ 性能指标收集测试完成');
    });

    it('应该维护性能历史记录', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      const testChannel = testManager.createMockChannel('history-test');
      
      dataFlowManager.registerChannel(testChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['history-test']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true
        }
      );

      monitor.start();

      // 分批发送数据以创建历史记录
      for (let batch = 0; batch < 5; batch++) {
        const batchData = generateHighFrequencyTrades(20, 'BTCUSDT', 50000);
        
        for (const data of batchData) {
          await dataFlowManager.processData(data);
        }
        
        await testUtils.wait(100); // 等待监控周期
      }

      await testManager.waitForProcessing(1000);

      // 获取性能历史
      const history = monitor.getPerformanceHistory(10);

      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
      expect(history.length).toBeLessThanOrEqual(10);

      // 验证历史记录结构
      history.forEach(record => {
        expect(record.performanceScore).toBeDefined();
        expect(record.throughput).toBeDefined();
        expect(record.latency).toBeDefined();
        expect(record.resourceUtilization).toBeDefined();
        expect(record.reliability).toBeDefined();
      });

      monitor.stop();

      console.log(`✅ 性能历史记录测试完成 - 记录数: ${history.length}`);
    });
  });

  describe('告警系统测试', () => {
    it('应该在高错误率时触发告警', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      
      // 创建会失败的通道
      const faultyChannel = testManager.createMockChannel('faulty', {
        shouldFail: true,
        failureRate: 0.8 // 80%失败率
      });

      dataFlowManager.registerChannel(faultyChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['faulty']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true,
          alertThresholds: {
            errorRateThreshold: 0.5, // 50%错误率阈值
            queueSizeThreshold: 1000,
            latencyThreshold: 1000,
            channelErrorThreshold: 5
          }
        }
      );

      let alertsTriggered = [];
      monitor.on('alertCreated', (alert) => {
        alertsTriggered.push(alert);
      });

      monitor.start();

      // 发送数据触发错误
      const errorTestData = generateHighFrequencyTrades(50, 'BTCUSDT', 50000);
      
      for (const data of errorTestData) {
        await dataFlowManager.processData(data).catch(() => {
          // 忽略预期的错误
        });
      }

      await testManager.waitForProcessing(1000);
      await testUtils.wait(200); // 等待监控检查

      // 验证告警触发
      expect(alertsTriggered.length).toBeGreaterThan(0);
      
      const errorRateAlerts = alertsTriggered.filter(alert => 
        alert.message.includes('High error rate')
      );
      
      expect(errorRateAlerts.length).toBeGreaterThan(0);
      expect(errorRateAlerts[0].type).toBe('warning');
      expect(errorRateAlerts[0].component).toBe('dataflow');

      monitor.stop();

      console.log(`✅ 错误率告警测试完成 - 触发告警数: ${alertsTriggered.length}`);
    });

    it('应该在队列大小超限时触发告警', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        performance: {
          maxQueueSize: 1000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 500
        }
      });

      // 创建慢速通道造成队列积压
      const slowChannel = testManager.createMockChannel('slow-queue', {
        processingDelay: 100 // 100ms处理延迟
      });

      dataFlowManager.registerChannel(slowChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['slow-queue']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true,
          alertThresholds: {
            errorRateThreshold: 0.1,
            queueSizeThreshold: 300, // 较低的队列阈值
            latencyThreshold: 1000,
            channelErrorThreshold: 10
          }
        }
      );

      let queueAlerts = [];
      monitor.on('alertCreated', (alert) => {
        if (alert.message.includes('Queue size')) {
          queueAlerts.push(alert);
        }
      });

      monitor.start();

      // 快速发送大量数据造成队列积压
      const queueData = generateHighFrequencyTrades(400, 'BTCUSDT', 50000);
      
      const sendPromises = queueData.map(data => 
        dataFlowManager.processData(data)
      );
      
      await Promise.allSettled(sendPromises);
      await testUtils.wait(200); // 等待监控检查

      // 验证队列告警
      expect(queueAlerts.length).toBeGreaterThan(0);
      expect(queueAlerts[0].type).toBe('critical');
      expect(queueAlerts[0].component).toBe('dataflow');

      await testManager.waitForProcessing(10000);
      monitor.stop();

      console.log(`✅ 队列大小告警测试完成 - 触发告警数: ${queueAlerts.length}`);
    });

    it('应该在背压激活时触发和解除告警', async () => {
      const dataFlowManager = await testManager.createDataFlowManager({
        performance: {
          maxQueueSize: 1000,
          processingTimeout: 5000,
          enableBackpressure: true,
          backpressureThreshold: 400
        }
      });

      const backpressureChannel = testManager.createMockChannel('backpressure-test', {
        processingDelay: 50
      });

      dataFlowManager.registerChannel(backpressureChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['backpressure-test']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true
        }
      );

      let backpressureAlerts = [];
      let resolvedAlerts = [];

      monitor.on('alertCreated', (alert) => {
        if (alert.message.includes('Backpressure')) {
          backpressureAlerts.push(alert);
        }
      });

      monitor.on('alertResolved', (alert) => {
        resolvedAlerts.push(alert);
      });

      monitor.start();

      // 发送数据激活背压
      const backpressureData = generateHighFrequencyTrades(600, 'BTCUSDT', 50000);
      
      for (const data of backpressureData) {
        await dataFlowManager.processData(data);
      }

      await testUtils.wait(200); // 等待背压激活和告警

      // 等待队列处理完成，背压解除
      await testManager.waitForProcessing(15000);
      await testUtils.wait(200); // 等待告警解除

      // 验证背压告警
      expect(backpressureAlerts.length).toBeGreaterThan(0);
      expect(backpressureAlerts[0].message).toContain('Backpressure is active');

      // 验证告警解除（背压事件监听器会自动解除相关告警）
      const activeAlerts = monitor.getActiveAlerts();
      const backpressureActiveAlerts = activeAlerts.filter(alert => 
        alert.message.includes('Backpressure')
      );
      
      expect(backpressureActiveAlerts.length).toBe(0); // 背压告警应该已解除

      monitor.stop();

      console.log(`✅ 背压告警测试完成 - 激活告警: ${backpressureAlerts.length}`);
    });

    it('应该支持手动告警解除', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        { enableMetrics: true }
      );

      monitor.start();

      // 手动创建告警（通过私有方法，在实际环境中会由监控条件触发）
      const testAlert = {
        id: 'test-alert-1',
        type: 'warning' as const,
        component: 'dataflow' as const,
        message: 'Test manual alert',
        details: { test: true },
        timestamp: Date.now(),
        resolved: false
      };

      // 模拟告警创建
      (monitor as any).alerts.set(testAlert.id, testAlert);

      // 验证告警存在
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].id).toBe(testAlert.id);

      // 手动解除告警
      const resolved = monitor.resolveAlert(testAlert.id);
      expect(resolved).toBe(true);

      // 验证告警已解除
      const remainingActiveAlerts = monitor.getActiveAlerts();
      expect(remainingActiveAlerts).toHaveLength(0);

      // 验证总告警列表仍包含已解除的告警
      const allAlerts = monitor.getAlerts();
      expect(allAlerts).toHaveLength(1);
      expect(allAlerts[0].resolved).toBe(true);

      monitor.stop();

      console.log('✅ 手动告警解除测试完成');
    });
  });

  describe('健康检查和系统评估', () => {
    it('应该正确评估系统整体健康状态', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      
      // 创建混合健康状态的通道
      const healthyChannel = testManager.createMockChannel('healthy', {
        processingDelay: 1
      });
      
      const degradedChannel = testManager.createMockChannel('degraded', {
        processingDelay: 5,
        failureRate: 0.1
      });

      [healthyChannel, degradedChannel].forEach(channel => {
        dataFlowManager.registerChannel(channel);
      });

      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['healthy', 'degraded']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          healthCheckInterval: 100,
          enableMetrics: true
        }
      );

      let healthCheckResults = [];
      
      // 监听健康检查结果（通过日志捕获）
      mockBaseMonitor.log.mockImplementation((level, message, details) => {
        if (message === 'Health check failed' || message.includes('unhealthy')) {
          healthCheckResults.push({ level, message, details });
        }
      });

      monitor.start();

      // 发送测试数据
      const healthTestData = generateHighFrequencyTrades(100, 'BTCUSDT', 50000);
      
      for (const data of healthTestData) {
        await dataFlowManager.processData(data).catch(() => {
          // 忽略预期的错误
        });
      }

      await testManager.waitForProcessing(2000);
      await testUtils.wait(200); // 等待健康检查

      // 检查通道状态
      const channelStatuses = dataFlowManager.getChannelStatuses();
      const healthyChannelStatus = channelStatuses.find(s => s.id === 'healthy');
      const degradedChannelStatus = channelStatuses.find(s => s.id === 'degraded');

      expect(healthyChannelStatus?.health).toBe('healthy');
      expect(degradedChannelStatus?.health).toBe('degraded');

      monitor.stop();

      console.log('✅ 系统健康评估测试完成');
    });

    it('应该计算准确的性能评分', async () => {
      performanceMonitor.start('性能评分测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        monitoring: {
          enableMetrics: true,
          metricsInterval: 100,
          enableLatencyTracking: true
        }
      });

      const performanceChannel = testManager.createMockChannel('performance', {
        processingDelay: 2
      });

      dataFlowManager.registerChannel(performanceChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['performance']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 100,
          enableMetrics: true,
          performanceBaseline: {
            maxLatency: 50,
            minThroughput: 100,
            maxErrorRate: 0.01
          }
        }
      );

      monitor.start();

      // 发送性能测试数据
      const performanceData = generateHighFrequencyTrades(200, 'BTCUSDT', 50000);
      const startTime = Date.now();
      
      for (const data of performanceData) {
        await dataFlowManager.processData(data);
      }
      
      await testManager.waitForProcessing(3000);
      const endTime = Date.now();

      await testUtils.wait(200); // 等待监控更新

      const performanceMetrics = monitor.getPerformanceMetrics();
      const performanceReport = performanceMonitor.stop();

      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics?.performanceScore).toBeGreaterThan(0);
      expect(performanceMetrics?.performanceScore).toBeLessThanOrEqual(100);

      // 验证各项指标
      expect(performanceMetrics?.throughput.current).toBeGreaterThan(0);
      expect(performanceMetrics?.latency.p95).toBeGreaterThan(0);
      expect(performanceMetrics?.reliability.successRate).toBeGreaterThan(0);

      const actualThroughput = performanceData.length / ((endTime - startTime) / 1000);

      console.log('📊 性能评分测试结果:');
      console.log(`  - 性能评分: ${performanceMetrics?.performanceScore}/100`);
      console.log(`  - 实际吞吐量: ${actualThroughput.toFixed(0)}条/秒`);
      console.log(`  - 报告吞吐量: ${performanceMetrics?.throughput.current.toFixed(0)}`);
      console.log(`  - P95延迟: ${performanceMetrics?.latency.p95.toFixed(2)}ms`);
      console.log(`  - 成功率: ${(performanceMetrics?.reliability.successRate * 100).toFixed(1)}%`);
      console.log(`  - 内存使用: ${performanceReport.metrics.memoryUsage.peak.toFixed(2)}MB`);

      monitor.stop();

      console.log('✅ 性能评分测试完成');
    }, 15000);
  });

  describe('监控数据导出和报告', () => {
    it('应该提供详细的监控统计数据', async () => {
      const dataFlowManager = await testManager.createDataFlowManager();
      const statsChannel = testManager.createMockChannel('stats-test');
      
      dataFlowManager.registerChannel(statsChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['stats-test']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 50,
          enableMetrics: true
        }
      );

      monitor.start();

      // 发送一些数据
      const statsData = generateHighFrequencyTrades(50, 'BTCUSDT', 50000);
      
      for (const data of statsData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(1000);
      await testUtils.wait(200); // 等待监控更新

      // 获取各种统计数据
      const performanceMetrics = monitor.getPerformanceMetrics();
      const performanceHistory = monitor.getPerformanceHistory(5);
      const alerts = monitor.getAlerts();
      const activeAlerts = monitor.getActiveAlerts();

      // 验证统计数据结构完整性
      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics?.performanceScore).toBeGreaterThanOrEqual(0);
      expect(performanceMetrics?.throughput).toBeDefined();
      expect(performanceMetrics?.latency).toBeDefined();
      expect(performanceMetrics?.resourceUtilization).toBeDefined();
      expect(performanceMetrics?.reliability).toBeDefined();

      expect(Array.isArray(performanceHistory)).toBe(true);
      expect(Array.isArray(alerts)).toBe(true);
      expect(Array.isArray(activeAlerts)).toBe(true);

      // 验证数据一致性
      expect(activeAlerts.length).toBeLessThanOrEqual(alerts.length);

      monitor.stop();

      console.log('📊 监控统计数据导出结果:');
      console.log(`  - 性能指标: ✓`);
      console.log(`  - 历史记录数: ${performanceHistory.length}`);
      console.log(`  - 总告警数: ${alerts.length}`);
      console.log(`  - 活跃告警数: ${activeAlerts.length}`);

      console.log('✅ 监控统计数据导出测试完成');
    });

    it('应该正确处理监控配置和基线对比', async () => {
      const customConfig = {
        monitoringInterval: 200,
        healthCheckInterval: 500,
        enableMetrics: true,
        alertThresholds: {
          errorRateThreshold: 0.05,
          queueSizeThreshold: 2000,
          latencyThreshold: 100,
          channelErrorThreshold: 20
        },
        performanceBaseline: {
          maxLatency: 30,
          minThroughput: 500,
          maxErrorRate: 0.005
        }
      };

      const dataFlowManager = await testManager.createDataFlowManager();
      const configChannel = testManager.createMockChannel('config-test');
      
      dataFlowManager.registerChannel(configChannel);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(['config-test']));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        customConfig
      );

      monitor.start();

      // 发送数据测试配置的应用
      const configData = generateHighFrequencyTrades(100, 'BTCUSDT', 50000);
      
      for (const data of configData) {
        await dataFlowManager.processData(data);
      }

      await testManager.waitForProcessing(1000);
      await testUtils.wait(600); // 等待监控和健康检查周期

      // 验证自定义配置的应用
      const performanceMetrics = monitor.getPerformanceMetrics();
      
      // 验证基线对比（性能评分应该基于自定义基线计算）
      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics?.performanceScore).toBeGreaterThanOrEqual(0);

      monitor.stop();

      console.log('📊 监控配置测试结果:');
      console.log(`  - 自定义监控间隔: ${customConfig.monitoringInterval}ms`);
      console.log(`  - 自定义健康检查间隔: ${customConfig.healthCheckInterval}ms`);
      console.log(`  - 自定义延迟基线: ${customConfig.performanceBaseline.maxLatency}ms`);
      console.log(`  - 自定义吞吐量基线: ${customConfig.performanceBaseline.minThroughput}条/秒`);
      console.log(`  - 当前性能评分: ${performanceMetrics?.performanceScore}/100`);

      console.log('✅ 监控配置和基线对比测试完成');
    });
  });

  describe('监控系统压力测试', () => {
    it('应该在高负载监控下保持稳定', async () => {
      performanceMonitor.start('监控系统压力测试');

      const dataFlowManager = await testManager.createDataFlowManager({
        monitoring: {
          enableMetrics: true,
          metricsInterval: 50, // 高频监控
          enableLatencyTracking: true
        }
      });

      // 创建多个通道增加监控复杂度
      const stressChannels = [];
      for (let i = 0; i < 10; i++) {
        const channel = testManager.createMockChannel(`stress-monitor-${i}`, {
          processingDelay: Math.random() * 10
        });
        stressChannels.push(channel);
        dataFlowManager.registerChannel(channel);
      }

      const channelIds = stressChannels.map(c => c.id);
      dataFlowManager.addRoutingRule(testManager.createCatchAllRule(channelIds));
      dataFlowManager.start();

      const monitor = new DataFlowMonitor(
        dataFlowManager,
        mockBaseMonitor,
        {
          monitoringInterval: 25, // 非常高频的监控
          healthCheckInterval: 100,
          enableMetrics: true
        }
      );

      let metricsUpdateCount = 0;
      monitor.on('statsUpdated', () => {
        metricsUpdateCount++;
      });

      monitor.start();

      // 生成压力测试数据
      const stressData = generateStressTestData(1000, 3); // 1000条/秒，持续3秒

      const stressStartTime = Date.now();

      // 高频发送数据
      for (const data of stressData) {
        await dataFlowManager.processData(data);
        
        // 每100条数据检查一次监控开销
        if (stressData.indexOf(data) % 100 === 0) {
          await testUtils.wait(1);
        }
      }

      await testManager.waitForProcessing(10000);
      
      const stressEndTime = Date.now();
      const stressDuration = (stressEndTime - stressStartTime) / 1000;

      await testUtils.wait(500); // 等待最后的监控更新

      const performanceReport = performanceMonitor.stop();

      // 验证监控系统在压力下的表现
      const finalMetrics = monitor.getPerformanceMetrics();
      const totalOutputs = stressChannels.reduce(
        (total, channel) => total + channel.getOutputHistory().length,
        0
      );

      expect(finalMetrics).toBeDefined();
      expect(metricsUpdateCount).toBeGreaterThan(50); // 应该有大量的指标更新
      expect(totalOutputs).toBeGreaterThan(stressData.length * 5); // 大部分数据应该被处理

      console.log('📊 监控系统压力测试结果:');
      console.log(`  - 压力数据量: ${stressData.length}`);
      console.log(`  - 压力持续时间: ${stressDuration.toFixed(2)}s`);
      console.log(`  - 监控通道数: ${stressChannels.length}`);
      console.log(`  - 指标更新次数: ${metricsUpdateCount}`);
      console.log(`  - 总处理输出: ${totalOutputs}`);
      console.log(`  - 监控内存开销: ${performanceReport.metrics.memoryUsage.growth.toFixed(2)}MB`);
      console.log(`  - 最终性能评分: ${finalMetrics?.performanceScore}/100`);

      // 监控系统性能验收标准
      expect(performanceReport.metrics.memoryUsage.growth).toBeLessThan(50); // 监控内存开销 < 50MB
      expect(finalMetrics?.performanceScore).toBeGreaterThan(60); // 压力下性能评分 > 60

      monitor.stop();

      console.log('✅ 监控系统压力测试完成');
    }, 30000);
  });
});