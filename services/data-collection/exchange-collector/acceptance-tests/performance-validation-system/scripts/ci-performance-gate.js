#!/usr/bin/env node

/**
 * CI/CD性能门控脚本
 * 在CI/CD流水线中执行性能测试并判断是否通过性能门控
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// 性能门控配置
const PERFORMANCE_GATES = {
  // 内存使用门控
  memory: {
    maxUsageMB: 100,        // 最大内存使用100MB
    maxIncreaseMB: 20,      // 相比基线最大增长20MB
    maxIncreasePercent: 25  // 相比基线最大增长25%
  },
  
  // 吞吐量门控
  throughput: {
    minMsgSec: 1200,           // 最低吞吐量1200 msg/sec
    minImprovementPercent: 50  // 相比基线最低提升50%
  },
  
  // 延迟门控
  latency: {
    maxAverageMs: 30,          // 最大平均延迟30ms
    maxP95Ms: 50,              // 最大P95延迟50ms
    maxRegressionPercent: 10   // 相比基线最大退化10%
  },
  
  // WebSocket门控
  websocket: {
    maxLatencyMs: 12,          // 最大WebSocket延迟12ms
    minConnectionSuccessRate: 0.95  // 最低连接成功率95%
  },
  
  // 稳定性门控
  stability: {
    maxMemoryLeakRate: 0.01,   // 最大内存泄漏率1%
    maxConnectionDropRate: 0.05, // 最大连接断开率5%
    maxErrorRate: 0.01         // 最大错误率1%
  },
  
  // 整体门控
  overall: {
    minPerformanceScore: 75,   // 最低性能评分75
    allowedRegressionScore: -5 // 允许的性能退化评分-5
  }
};

// CI环境配置
const CI_CONFIG = {
  timeout: 300000,           // 测试超时时间5分钟
  retries: 2,               // 失败重试次数
  reportFormats: ['json', 'junit', 'html'], // 报告格式
  slackWebhook: process.env.SLACK_WEBHOOK_URL, // Slack通知
  artifactDir: process.env.CI_ARTIFACT_DIR || './reports/ci'
};

class CIPerformanceGate {
  constructor() {
    this.results = {
      gates: {},
      overall: {
        passed: false,
        score: 0,
        failures: [],
        warnings: []
      },
      metadata: {
        timestamp: Date.now(),
        environment: this.getEnvironmentInfo(),
        commit: this.getCommitInfo()
      }
    };
  }

  /**
   * 执行性能门控检查
   */
  async execute() {
    console.log('🚦 开始执行CI/CD性能门控检查...');
    
    try {
      // 1. 运行性能测试
      console.log('📊 执行性能测试...');
      const testResults = await this.runPerformanceTests();
      
      // 2. 加载基线数据
      console.log('📈 加载性能基线数据...');
      const baselineData = await this.loadBaselineData();
      
      // 3. 执行门控检查
      console.log('🔍 执行性能门控检查...');
      await this.checkPerformanceGates(testResults, baselineData);
      
      // 4. 生成报告
      console.log('📋 生成性能门控报告...');
      await this.generateReports();
      
      // 5. 发送通知
      console.log('📢 发送性能门控通知...');
      await this.sendNotifications();
      
      // 6. 返回结果
      const passed = this.results.overall.passed;
      console.log(`🎯 性能门控${passed ? '✅ 通过' : '❌ 失败'}`);
      
      return passed;
      
    } catch (error) {
      console.error('❌ 性能门控执行失败:', error);
      this.results.overall.failures.push(`执行失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 运行性能测试
   */
  async runPerformanceTests() {
    const testCommand = 'npm run test:goals-validation';
    
    try {
      console.log(`执行命令: ${testCommand}`);
      
      const output = execSync(testCommand, {
        cwd: path.join(__dirname, '..'),
        timeout: CI_CONFIG.timeout,
        encoding: 'utf8'
      });
      
      console.log('✅ 性能测试执行完成');
      
      // 从测试输出中提取性能数据
      return this.extractPerformanceData(output);
      
    } catch (error) {
      console.error('❌ 性能测试执行失败:', error.message);
      throw new Error(`性能测试执行失败: ${error.message}`);
    }
  }

  /**
   * 从测试输出中提取性能数据
   */
  extractPerformanceData(testOutput) {
    // 这里需要解析Jest测试输出或读取生成的性能数据文件
    // 简化实现，实际应该解析详细的测试结果
    
    const reportsDir = path.join(__dirname, '..', 'reports');
    const latestReportFile = this.findLatestReportFile(reportsDir);
    
    if (latestReportFile) {
      const reportData = fs.readJsonSync(latestReportFile);
      return this.normalizeTestResults(reportData);
    }
    
    // 如果没有找到报告文件，从测试输出解析基本信息
    return this.parseTestOutput(testOutput);
  }

  /**
   * 查找最新的测试报告文件
   */
  findLatestReportFile(reportsDir) {
    try {
      const files = fs.readdirSync(reportsDir)
        .filter(file => file.startsWith('performance-test-data-'))
        .map(file => ({
          name: file,
          path: path.join(reportsDir, file),
          mtime: fs.statSync(path.join(reportsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      return files.length > 0 ? files[0].path : null;
    } catch (error) {
      console.warn('查找报告文件失败:', error.message);
      return null;
    }
  }

  /**
   * 规范化测试结果
   */
  normalizeTestResults(reportData) {
    // 将测试报告数据转换为门控检查所需的格式
    const metrics = {};
    
    // 提取关键性能指标
    reportData.forEach(entry => {
      if (!metrics[entry.metricName]) {
        metrics[entry.metricName] = [];
      }
      metrics[entry.metricName].push(entry.value);
    });
    
    // 计算统计值
    const calculateStats = (values) => ({
      average: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
      p95: values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)] || 0
    });
    
    return {
      memory: {
        usage: calculateStats(metrics['memory-usage-mb'] || [0])
      },
      throughput: {
        msgPerSec: calculateStats(metrics['throughput-msg-sec'] || [0])
      },
      latency: {
        average: calculateStats(metrics['latency-avg-ms'] || [0]),
        p95: calculateStats(metrics['latency-p95-ms'] || [0])
      },
      websocket: {
        latency: calculateStats(metrics['websocket-latency-ms'] || [0]),
        connectionSuccessRate: calculateStats(metrics['websocket-connection-success-rate'] || [1])
      },
      stability: {
        memoryLeakRate: calculateStats(metrics['stability-memory-leak-rate'] || [0]),
        connectionDropRate: calculateStats(metrics['stability-connection-drop-rate'] || [0]),
        errorRate: calculateStats(metrics['stability-error-rate'] || [0])
      }
    };
  }

  /**
   * 解析测试输出
   */
  parseTestOutput(output) {
    // 简化实现：从控制台输出中提取关键指标
    const results = {
      memory: { usage: { average: 0 } },
      throughput: { msgPerSec: { average: 0 } },
      latency: { average: { average: 0 }, p95: { average: 0 } },
      websocket: { latency: { average: 0 }, connectionSuccessRate: { average: 1 } },
      stability: { memoryLeakRate: { average: 0 }, connectionDropRate: { average: 0 }, errorRate: { average: 0 } }
    };
    
    // 使用正则表达式从输出中提取数字
    const extractValue = (pattern, defaultValue = 0) => {
      const match = output.match(pattern);
      return match ? parseFloat(match[1]) : defaultValue;
    };
    
    results.memory.usage.average = extractValue(/内存使用.*?(\d+\.\d+)\s*MB/);
    results.throughput.msgPerSec.average = extractValue(/吞吐量.*?(\d+\.\d+)\s*msg\/sec/);
    results.latency.average.average = extractValue(/平均延迟.*?(\d+\.\d+)\s*ms/);
    
    return results;
  }

  /**
   * 加载基线数据
   */
  async loadBaselineData() {
    const baselinePath = path.join(__dirname, '..', 'reports', 'baselines', 'performance-baseline.json');
    
    try {
      if (await fs.pathExists(baselinePath)) {
        return await fs.readJson(baselinePath);
      } else {
        console.warn('⚠️ 未找到性能基线数据，将使用默认值');
        return this.getDefaultBaselineData();
      }
    } catch (error) {
      console.warn('⚠️ 加载基线数据失败，使用默认值:', error.message);
      return this.getDefaultBaselineData();
    }
  }

  /**
   * 获取默认基线数据
   */
  getDefaultBaselineData() {
    return {
      performanceMetrics: {
        memory: { averageMB: 120 },
        throughput: { averageMsgSec: 800 },
        latency: { averageMs: 45, p95Ms: 80 },
        websocket: { averageLatencyMs: 15, connectionSuccessRate: 0.95 },
        stability: { memoryLeakRate: 0.02, connectionDropRate: 0.1, errorRate: 0.02 }
      }
    };
  }

  /**
   * 执行性能门控检查
   */
  async checkPerformanceGates(testResults, baselineData) {
    const baseline = baselineData.performanceMetrics;
    
    // 内存门控检查
    this.checkMemoryGates(testResults.memory, baseline.memory);
    
    // 吞吐量门控检查
    this.checkThroughputGates(testResults.throughput, baseline.throughput);
    
    // 延迟门控检查
    this.checkLatencyGates(testResults.latency, baseline.latency);
    
    // WebSocket门控检查
    this.checkWebSocketGates(testResults.websocket, baseline.websocket);
    
    // 稳定性门控检查
    this.checkStabilityGates(testResults.stability, baseline.stability);
    
    // 计算整体结果
    this.calculateOverallResult();
  }

  /**
   * 内存门控检查
   */
  checkMemoryGates(current, baseline) {
    const gate = {
      name: 'memory',
      passed: true,
      checks: []
    };
    
    // 检查最大内存使用
    const maxUsageCheck = {
      name: '最大内存使用',
      threshold: PERFORMANCE_GATES.memory.maxUsageMB,
      actual: current.usage.average,
      passed: current.usage.average <= PERFORMANCE_GATES.memory.maxUsageMB,
      unit: 'MB'
    };
    gate.checks.push(maxUsageCheck);
    
    // 检查相对基线的增长
    const increase = current.usage.average - baseline.averageMB;
    const increasePercent = (increase / baseline.averageMB) * 100;
    
    const increaseCheck = {
      name: '相对基线内存增长',
      threshold: PERFORMANCE_GATES.memory.maxIncreasePercent,
      actual: increasePercent,
      passed: increasePercent <= PERFORMANCE_GATES.memory.maxIncreasePercent,
      unit: '%'
    };
    gate.checks.push(increaseCheck);
    
    gate.passed = gate.checks.every(check => check.passed);
    this.results.gates.memory = gate;
    
    console.log(`📊 内存门控: ${gate.passed ? '✅ 通过' : '❌ 失败'}`);
    gate.checks.forEach(check => {
      console.log(`  ${check.name}: ${check.actual.toFixed(2)}${check.unit} (阈值: ${check.threshold}${check.unit}) ${check.passed ? '✅' : '❌'}`);
    });
  }

  /**
   * 吞吐量门控检查
   */
  checkThroughputGates(current, baseline) {
    const gate = {
      name: 'throughput',
      passed: true,
      checks: []
    };
    
    // 检查最小吞吐量
    const minThroughputCheck = {
      name: '最小吞吐量',
      threshold: PERFORMANCE_GATES.throughput.minMsgSec,
      actual: current.msgPerSec.average,
      passed: current.msgPerSec.average >= PERFORMANCE_GATES.throughput.minMsgSec,
      unit: 'msg/sec'
    };
    gate.checks.push(minThroughputCheck);
    
    // 检查相对基线的提升
    const improvement = ((current.msgPerSec.average - baseline.averageMsgSec) / baseline.averageMsgSec) * 100;
    
    const improvementCheck = {
      name: '相对基线吞吐量提升',
      threshold: PERFORMANCE_GATES.throughput.minImprovementPercent,
      actual: improvement,
      passed: improvement >= PERFORMANCE_GATES.throughput.minImprovementPercent,
      unit: '%'
    };
    gate.checks.push(improvementCheck);
    
    gate.passed = gate.checks.every(check => check.passed);
    this.results.gates.throughput = gate;
    
    console.log(`📊 吞吐量门控: ${gate.passed ? '✅ 通过' : '❌ 失败'}`);
    gate.checks.forEach(check => {
      console.log(`  ${check.name}: ${check.actual.toFixed(2)}${check.unit} (阈值: ${check.threshold}${check.unit}) ${check.passed ? '✅' : '❌'}`);
    });
  }

  /**
   * 延迟门控检查
   */
  checkLatencyGates(current, baseline) {
    const gate = {
      name: 'latency',
      passed: true,
      checks: []
    };
    
    // 检查最大平均延迟
    const avgLatencyCheck = {
      name: '最大平均延迟',
      threshold: PERFORMANCE_GATES.latency.maxAverageMs,
      actual: current.average.average,
      passed: current.average.average <= PERFORMANCE_GATES.latency.maxAverageMs,
      unit: 'ms'
    };
    gate.checks.push(avgLatencyCheck);
    
    // 检查最大P95延迟
    const p95LatencyCheck = {
      name: '最大P95延迟',
      threshold: PERFORMANCE_GATES.latency.maxP95Ms,
      actual: current.p95.average,
      passed: current.p95.average <= PERFORMANCE_GATES.latency.maxP95Ms,
      unit: 'ms'
    };
    gate.checks.push(p95LatencyCheck);
    
    // 检查相对基线的退化
    const regression = ((current.average.average - baseline.averageMs) / baseline.averageMs) * 100;
    
    const regressionCheck = {
      name: '相对基线延迟退化',
      threshold: PERFORMANCE_GATES.latency.maxRegressionPercent,
      actual: regression,
      passed: regression <= PERFORMANCE_GATES.latency.maxRegressionPercent,
      unit: '%'
    };
    gate.checks.push(regressionCheck);
    
    gate.passed = gate.checks.every(check => check.passed);
    this.results.gates.latency = gate;
    
    console.log(`📊 延迟门控: ${gate.passed ? '✅ 通过' : '❌ 失败'}`);
    gate.checks.forEach(check => {
      console.log(`  ${check.name}: ${check.actual.toFixed(2)}${check.unit} (阈值: ${check.threshold}${check.unit}) ${check.passed ? '✅' : '❌'}`);
    });
  }

  /**
   * WebSocket门控检查
   */
  checkWebSocketGates(current, baseline) {
    const gate = {
      name: 'websocket',
      passed: true,
      checks: []
    };
    
    // 检查最大WebSocket延迟
    const latencyCheck = {
      name: '最大WebSocket延迟',
      threshold: PERFORMANCE_GATES.websocket.maxLatencyMs,
      actual: current.latency.average,
      passed: current.latency.average <= PERFORMANCE_GATES.websocket.maxLatencyMs,
      unit: 'ms'
    };
    gate.checks.push(latencyCheck);
    
    // 检查连接成功率
    const successRateCheck = {
      name: '最低连接成功率',
      threshold: PERFORMANCE_GATES.websocket.minConnectionSuccessRate,
      actual: current.connectionSuccessRate.average,
      passed: current.connectionSuccessRate.average >= PERFORMANCE_GATES.websocket.minConnectionSuccessRate,
      unit: ''
    };
    gate.checks.push(successRateCheck);
    
    gate.passed = gate.checks.every(check => check.passed);
    this.results.gates.websocket = gate;
    
    console.log(`📊 WebSocket门控: ${gate.passed ? '✅ 通过' : '❌ 失败'}`);
    gate.checks.forEach(check => {
      console.log(`  ${check.name}: ${check.actual.toFixed(3)}${check.unit} (阈值: ${check.threshold}${check.unit}) ${check.passed ? '✅' : '❌'}`);
    });
  }

  /**
   * 稳定性门控检查
   */
  checkStabilityGates(current, baseline) {
    const gate = {
      name: 'stability',
      passed: true,
      checks: []
    };
    
    // 检查内存泄漏率
    const memoryLeakCheck = {
      name: '最大内存泄漏率',
      threshold: PERFORMANCE_GATES.stability.maxMemoryLeakRate,
      actual: current.memoryLeakRate.average,
      passed: current.memoryLeakRate.average <= PERFORMANCE_GATES.stability.maxMemoryLeakRate,
      unit: ''
    };
    gate.checks.push(memoryLeakCheck);
    
    // 检查连接断开率
    const dropRateCheck = {
      name: '最大连接断开率',
      threshold: PERFORMANCE_GATES.stability.maxConnectionDropRate,
      actual: current.connectionDropRate.average,
      passed: current.connectionDropRate.average <= PERFORMANCE_GATES.stability.maxConnectionDropRate,
      unit: ''
    };
    gate.checks.push(dropRateCheck);
    
    // 检查错误率
    const errorRateCheck = {
      name: '最大错误率',
      threshold: PERFORMANCE_GATES.stability.maxErrorRate,
      actual: current.errorRate.average,
      passed: current.errorRate.average <= PERFORMANCE_GATES.stability.maxErrorRate,
      unit: ''
    };
    gate.checks.push(errorRateCheck);
    
    gate.passed = gate.checks.every(check => check.passed);
    this.results.gates.stability = gate;
    
    console.log(`📊 稳定性门控: ${gate.passed ? '✅ 通过' : '❌ 失败'}`);
    gate.checks.forEach(check => {
      console.log(`  ${check.name}: ${(check.actual * 100).toFixed(2)}%${check.unit} (阈值: ${(check.threshold * 100).toFixed(2)}%${check.unit}) ${check.passed ? '✅' : '❌'}`);
    });
  }

  /**
   * 计算整体结果
   */
  calculateOverallResult() {
    const gates = Object.values(this.results.gates);
    const passedGates = gates.filter(gate => gate.passed);
    
    this.results.overall.score = (passedGates.length / gates.length) * 100;
    this.results.overall.passed = this.results.overall.score >= PERFORMANCE_GATES.overall.minPerformanceScore;
    
    // 收集失败信息
    gates.forEach(gate => {
      if (!gate.passed) {
        gate.checks.forEach(check => {
          if (!check.passed) {
            this.results.overall.failures.push(`${gate.name}: ${check.name} 失败 (${check.actual.toFixed(2)}${check.unit} > ${check.threshold}${check.unit})`);
          }
        });
      }
    });
    
    console.log(`🎯 整体门控评分: ${this.results.overall.score.toFixed(1)}/100 (最低要求: ${PERFORMANCE_GATES.overall.minPerformanceScore})`);
    console.log(`🎯 整体门控结果: ${this.results.overall.passed ? '✅ 通过' : '❌ 失败'}`);
    
    if (this.results.overall.failures.length > 0) {
      console.log('❌ 失败详情:');
      this.results.overall.failures.forEach(failure => {
        console.log(`  ${failure}`);
      });
    }
  }

  /**
   * 生成报告
   */
  async generateReports() {
    await fs.ensureDir(CI_CONFIG.artifactDir);
    
    // JSON报告
    if (CI_CONFIG.reportFormats.includes('json')) {
      const jsonReportPath = path.join(CI_CONFIG.artifactDir, 'performance-gate-results.json');
      await fs.writeJson(jsonReportPath, this.results, { spaces: 2 });
      console.log(`📄 JSON报告: ${jsonReportPath}`);
    }
    
    // JUnit报告（用于CI系统集成）
    if (CI_CONFIG.reportFormats.includes('junit')) {
      const junitReportPath = path.join(CI_CONFIG.artifactDir, 'performance-gate-junit.xml');
      await this.generateJUnitReport(junitReportPath);
      console.log(`📄 JUnit报告: ${junitReportPath}`);
    }
    
    // HTML报告
    if (CI_CONFIG.reportFormats.includes('html')) {
      const htmlReportPath = path.join(CI_CONFIG.artifactDir, 'performance-gate-report.html');
      await this.generateHTMLReport(htmlReportPath);
      console.log(`📄 HTML报告: ${htmlReportPath}`);
    }
  }

  /**
   * 生成JUnit报告
   */
  async generateJUnitReport(filePath) {
    const testCases = [];
    
    Object.values(this.results.gates).forEach(gate => {
      gate.checks.forEach(check => {
        const testCase = {
          name: `${gate.name}.${check.name}`,
          classname: 'PerformanceGates',
          time: 0,
          failure: check.passed ? null : `Expected <= ${check.threshold}${check.unit}, but got ${check.actual.toFixed(2)}${check.unit}`
        };
        testCases.push(testCase);
      });
    });
    
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="PerformanceGates" tests="${testCases.length}" failures="${testCases.filter(tc => tc.failure).length}" time="0">
${testCases.map(tc => `
  <testcase name="${tc.name}" classname="${tc.classname}" time="${tc.time}">
    ${tc.failure ? `<failure message="${tc.failure}"></failure>` : ''}
  </testcase>`).join('')}
</testsuite>`;
    
    await fs.writeFile(filePath, junitXml);
  }

  /**
   * 生成HTML报告
   */
  async generateHTMLReport(filePath) {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>性能门控报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background-color: ${this.results.overall.passed ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 5px; }
        .gate { margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px; }
        .passed { background-color: #d4edda; }
        .failed { background-color: #f8d7da; }
        .check { margin: 10px 0; padding: 10px; background-color: #f8f9fa; border-left: 4px solid #007bff; }
        .check.failed { border-left-color: #dc3545; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>性能门控报告</h1>
        <p><strong>状态:</strong> ${this.results.overall.passed ? '✅ 通过' : '❌ 失败'}</p>
        <p><strong>评分:</strong> ${this.results.overall.score.toFixed(1)}/100</p>
        <p><strong>时间:</strong> ${new Date(this.results.metadata.timestamp).toISOString()}</p>
        <p><strong>提交:</strong> ${this.results.metadata.commit.hash} by ${this.results.metadata.commit.author}</p>
    </div>

    <h2>门控详情</h2>
    ${Object.values(this.results.gates).map(gate => `
    <div class="gate ${gate.passed ? 'passed' : 'failed'}">
        <h3>${gate.name.toUpperCase()} ${gate.passed ? '✅' : '❌'}</h3>
        ${gate.checks.map(check => `
        <div class="check ${check.passed ? '' : 'failed'}">
            <strong>${check.name}:</strong> 
            ${check.actual.toFixed(2)}${check.unit} 
            (阈值: ${check.threshold}${check.unit}) 
            ${check.passed ? '✅' : '❌'}
        </div>
        `).join('')}
    </div>
    `).join('')}

    ${this.results.overall.failures.length > 0 ? `
    <h2>失败详情</h2>
    <ul>
        ${this.results.overall.failures.map(failure => `<li>${failure}</li>`).join('')}
    </ul>
    ` : ''}
</body>
</html>`;
    
    await fs.writeFile(filePath, html);
  }

  /**
   * 发送通知
   */
  async sendNotifications() {
    if (CI_CONFIG.slackWebhook && !this.results.overall.passed) {
      try {
        const fetch = require('node-fetch');
        
        const message = {
          text: `🚨 性能门控失败`,
          attachments: [{
            color: 'danger',
            fields: [
              { title: '提交', value: this.results.metadata.commit.hash, short: true },
              { title: '分支', value: this.results.metadata.commit.branch, short: true },
              { title: '评分', value: `${this.results.overall.score.toFixed(1)}/100`, short: true },
              { title: '失败数', value: this.results.overall.failures.length.toString(), short: true }
            ],
            text: this.results.overall.failures.slice(0, 3).join('\n')
          }]
        };
        
        await fetch(CI_CONFIG.slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
        
        console.log('📢 Slack通知已发送');
      } catch (error) {
        console.warn('⚠️ Slack通知发送失败:', error.message);
      }
    }
  }

  /**
   * 获取环境信息
   */
  getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: !!process.env.CI,
      ciProvider: process.env.CI_PROVIDER || 'unknown'
    };
  }

  /**
   * 获取提交信息
   */
  getCommitInfo() {
    try {
      return {
        hash: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
        shortHash: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
        branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
        author: execSync('git log -1 --pretty=format:"%an"', { encoding: 'utf8' }).trim(),
        message: execSync('git log -1 --pretty=format:"%s"', { encoding: 'utf8' }).trim(),
        timestamp: execSync('git log -1 --pretty=format:"%ct"', { encoding: 'utf8' }).trim()
      };
    } catch (error) {
      console.warn('⚠️ 获取Git信息失败:', error.message);
      return {
        hash: 'unknown',
        shortHash: 'unknown',
        branch: 'unknown',
        author: 'unknown',
        message: 'unknown',
        timestamp: Date.now()
      };
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const gate = new CIPerformanceGate();
  
  gate.execute()
    .then(passed => {
      console.log(`\n🎯 性能门控${passed ? '✅ 通过' : '❌ 失败'}`);
      process.exit(passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ 性能门控执行失败:', error);
      process.exit(1);
    });
}

module.exports = CIPerformanceGate;