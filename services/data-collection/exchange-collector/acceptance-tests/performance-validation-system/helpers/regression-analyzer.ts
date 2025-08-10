/**
 * 性能回归分析系统
 * 对比重构前后的性能数据，识别性能改进和潜在回归
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { TEST_CONFIG, PERFORMANCE_GOALS } from '../setup';

export interface BaselineData {
  version: string;
  timestamp: number;
  testEnvironment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    totalMemory: number;
    cpuCores: number;
  };
  performanceMetrics: {
    memory: {
      averageMB: number;
      peakMB: number;
      baselineMB: number;
    };
    throughput: {
      averageMsgSec: number;
      peakMsgSec: number;
      baselineMsgSec: number;
    };
    latency: {
      averageMs: number;
      p95Ms: number;
      p99Ms: number;
      baselineMs: number;
    };
    websocket: {
      averageLatencyMs: number;
      connectionSuccessRate: number;
      messageDeliveryRate: number;
    };
    stability: {
      memoryLeakRate: number;
      connectionDropRate: number;
      errorRate: number;
    };
  };
  testConfiguration: {
    testDuration: number;
    loadLevel: string;
    concurrency: number;
  };
}

export interface RegressionAnalysisResult {
  comparisonId: string;
  timestamp: number;
  baseline: BaselineData;
  current: BaselineData;
  analysis: {
    memory: {
      improvement: number; // 负数表示性能退化
      improvementPercent: number;
      status: 'improved' | 'degraded' | 'stable';
      significance: 'major' | 'minor' | 'negligible';
    };
    throughput: {
      improvement: number;
      improvementPercent: number;
      status: 'improved' | 'degraded' | 'stable';
      significance: 'major' | 'minor' | 'negligible';
    };
    latency: {
      improvement: number; // 负数表示延迟增加（退化）
      improvementPercent: number;
      status: 'improved' | 'degraded' | 'stable';
      significance: 'major' | 'minor' | 'negligible';
    };
    stability: {
      improvement: number;
      improvementPercent: number;
      status: 'improved' | 'degraded' | 'stable';
      significance: 'major' | 'minor' | 'negligible';
    };
  };
  overall: {
    performanceScore: number; // 0-100分
    improvementScore: number; // 相对于baseline的改进评分
    status: 'significant_improvement' | 'minor_improvement' | 'stable' | 'minor_regression' | 'significant_regression';
    recommendation: string;
  };
  goalAchievement: {
    memoryReduction: {
      target: number;
      achieved: number;
      success: boolean;
    };
    throughputImprovement: {
      target: number;
      achieved: number;
      success: boolean;
    };
    latencyReduction: {
      target: number;
      achieved: number;
      success: boolean;
    };
  };
}

export class PerformanceRegressionAnalyzer {
  private baselineDataPath: string;
  private comparisonDataPath: string;

  constructor() {
    this.baselineDataPath = path.join(TEST_CONFIG.BASELINES_DIR, 'performance-baseline.json');
    this.comparisonDataPath = path.join(TEST_CONFIG.BENCHMARKS_DIR, 'performance-comparison.json');
  }

  /**
   * 创建性能基线
   */
  async createBaseline(performanceData: any, version = 'baseline'): Promise<void> {
    const baseline: BaselineData = {
      version,
      timestamp: Date.now(),
      testEnvironment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        totalMemory: require('os').totalmem(),
        cpuCores: require('os').cpus().length
      },
      performanceMetrics: this.extractPerformanceMetrics(performanceData),
      testConfiguration: this.extractTestConfiguration(performanceData)
    };

    await fs.ensureDir(TEST_CONFIG.BASELINES_DIR);
    await fs.writeJSON(this.baselineDataPath, baseline, { spaces: 2 });

    console.log(`📈 性能基线已创建: ${this.baselineDataPath}`);
  }

  /**
   * 加载性能基线
   */
  async loadBaseline(): Promise<BaselineData | null> {
    try {
      if (await fs.pathExists(this.baselineDataPath)) {
        const baseline = await fs.readJSON(this.baselineDataPath);
        console.log(`📖 已加载性能基线: ${baseline.version} (${new Date(baseline.timestamp).toISOString()})`);
        return baseline;
      }
    } catch (error) {
      console.warn('加载性能基线失败:', error);
    }
    return null;
  }

  /**
   * 执行回归分析
   */
  async performRegressionAnalysis(currentPerformanceData: any, currentVersion = 'current'): Promise<RegressionAnalysisResult> {
    const baseline = await this.loadBaseline();
    if (!baseline) {
      throw new Error('未找到性能基线数据，请先创建基线');
    }

    const current: BaselineData = {
      version: currentVersion,
      timestamp: Date.now(),
      testEnvironment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        totalMemory: require('os').totalmem(),
        cpuCores: require('os').cpus().length
      },
      performanceMetrics: this.extractPerformanceMetrics(currentPerformanceData),
      testConfiguration: this.extractTestConfiguration(currentPerformanceData)
    };

    const analysis = this.analyzePerformanceChanges(baseline, current);
    const goalAchievement = this.analyzeGoalAchievement(baseline, current);

    const result: RegressionAnalysisResult = {
      comparisonId: `${baseline.version}-vs-${current.version}-${Date.now()}`,
      timestamp: Date.now(),
      baseline,
      current,
      analysis,
      overall: this.calculateOverallAssessment(analysis),
      goalAchievement
    };

    // 保存对比分析结果
    await this.saveComparisonResult(result);

    return result;
  }

  /**
   * 生成回归分析报告
   */
  async generateRegressionReport(analysisResult: RegressionAnalysisResult): Promise<string> {
    const report = {
      title: '性能回归分析报告',
      summary: this.generateReportSummary(analysisResult),
      detailedAnalysis: this.generateDetailedAnalysis(analysisResult),
      goalAchievement: this.generateGoalAchievementReport(analysisResult),
      recommendations: this.generateRecommendations(analysisResult),
      rawData: analysisResult
    };

    const reportPath = path.join(TEST_CONFIG.REPORTS_DIR, `regression-analysis-${analysisResult.comparisonId}.json`);
    await fs.writeJSON(reportPath, report, { spaces: 2 });

    // 生成可读的文本报告
    const textReportPath = await this.generateTextReport(report, analysisResult);

    console.log(`📊 回归分析报告已生成:`);
    console.log(`   JSON: ${reportPath}`);
    console.log(`   文本: ${textReportPath}`);

    return textReportPath;
  }

  /**
   * 提取性能指标
   */
  private extractPerformanceMetrics(performanceData: any): BaselineData['performanceMetrics'] {
    // 从性能测试数据中提取标准化指标
    return {
      memory: {
        averageMB: performanceData.memory?.average || 0,
        peakMB: performanceData.memory?.peak || 0,
        baselineMB: performanceData.memory?.baseline || 0
      },
      throughput: {
        averageMsgSec: performanceData.throughput?.average || 0,
        peakMsgSec: performanceData.throughput?.peak || 0,
        baselineMsgSec: performanceData.throughput?.baseline || 0
      },
      latency: {
        averageMs: performanceData.latency?.average || 0,
        p95Ms: performanceData.latency?.p95 || 0,
        p99Ms: performanceData.latency?.p99 || 0,
        baselineMs: performanceData.latency?.baseline || 0
      },
      websocket: {
        averageLatencyMs: performanceData.websocket?.latency || 0,
        connectionSuccessRate: performanceData.websocket?.connectionSuccessRate || 1,
        messageDeliveryRate: performanceData.websocket?.messageDeliveryRate || 1
      },
      stability: {
        memoryLeakRate: performanceData.stability?.memoryLeakRate || 0,
        connectionDropRate: performanceData.stability?.connectionDropRate || 0,
        errorRate: performanceData.stability?.errorRate || 0
      }
    };
  }

  /**
   * 提取测试配置
   */
  private extractTestConfiguration(performanceData: any): BaselineData['testConfiguration'] {
    return {
      testDuration: performanceData.testDuration || TEST_CONFIG.TEST_DURATION.MEDIUM,
      loadLevel: performanceData.loadLevel || 'medium',
      concurrency: performanceData.concurrency || 100
    };
  }

  /**
   * 分析性能变化
   */
  private analyzePerformanceChanges(baseline: BaselineData, current: BaselineData): RegressionAnalysisResult['analysis'] {
    const memoryImprovement = baseline.performanceMetrics.memory.averageMB - current.performanceMetrics.memory.averageMB;
    const memoryImprovementPercent = (memoryImprovement / baseline.performanceMetrics.memory.averageMB) * 100;

    const throughputImprovement = current.performanceMetrics.throughput.averageMsgSec - baseline.performanceMetrics.throughput.averageMsgSec;
    const throughputImprovementPercent = (throughputImprovement / baseline.performanceMetrics.throughput.averageMsgSec) * 100;

    const latencyImprovement = baseline.performanceMetrics.latency.averageMs - current.performanceMetrics.latency.averageMs;
    const latencyImprovementPercent = (latencyImprovement / baseline.performanceMetrics.latency.averageMs) * 100;

    // 稳定性评分综合计算
    const stabilityImprovement = this.calculateStabilityImprovement(baseline, current);
    const stabilityImprovementPercent = stabilityImprovement.percentChange;

    return {
      memory: {
        improvement: memoryImprovement,
        improvementPercent: memoryImprovementPercent,
        status: this.determineStatus(memoryImprovementPercent, 'memory'),
        significance: this.determineSignificance(Math.abs(memoryImprovementPercent))
      },
      throughput: {
        improvement: throughputImprovement,
        improvementPercent: throughputImprovementPercent,
        status: this.determineStatus(throughputImprovementPercent, 'throughput'),
        significance: this.determineSignificance(Math.abs(throughputImprovementPercent))
      },
      latency: {
        improvement: latencyImprovement,
        improvementPercent: latencyImprovementPercent,
        status: this.determineStatus(latencyImprovementPercent, 'latency'),
        significance: this.determineSignificance(Math.abs(latencyImprovementPercent))
      },
      stability: {
        improvement: stabilityImprovement.score,
        improvementPercent: stabilityImprovementPercent,
        status: this.determineStatus(stabilityImprovementPercent, 'stability'),
        significance: this.determineSignificance(Math.abs(stabilityImprovementPercent))
      }
    };
  }

  /**
   * 计算稳定性改进
   */
  private calculateStabilityImprovement(baseline: BaselineData, current: BaselineData): { score: number; percentChange: number } {
    const baselineStabilityScore = 100 - (
      baseline.performanceMetrics.stability.memoryLeakRate * 30 +
      baseline.performanceMetrics.stability.connectionDropRate * 40 +
      baseline.performanceMetrics.stability.errorRate * 30
    );

    const currentStabilityScore = 100 - (
      current.performanceMetrics.stability.memoryLeakRate * 30 +
      current.performanceMetrics.stability.connectionDropRate * 40 +
      current.performanceMetrics.stability.errorRate * 30
    );

    const improvement = currentStabilityScore - baselineStabilityScore;
    const percentChange = baselineStabilityScore > 0 ? (improvement / baselineStabilityScore) * 100 : 0;

    return { score: improvement, percentChange };
  }

  /**
   * 确定性能状态
   */
  private determineStatus(improvementPercent: number, metric: string): 'improved' | 'degraded' | 'stable' {
    const threshold = metric === 'memory' || metric === 'latency' ? 5 : 10; // 内存和延迟阈值较低
    
    if (improvementPercent > threshold) return 'improved';
    if (improvementPercent < -threshold) return 'degraded';
    return 'stable';
  }

  /**
   * 确定改进显著性
   */
  private determineSignificance(absolutePercent: number): 'major' | 'minor' | 'negligible' {
    if (absolutePercent > 20) return 'major';
    if (absolutePercent > 5) return 'minor';
    return 'negligible';
  }

  /**
   * 计算整体评估
   */
  private calculateOverallAssessment(analysis: RegressionAnalysisResult['analysis']): RegressionAnalysisResult['overall'] {
    // 计算加权平均性能改进
    const weights = { memory: 0.3, throughput: 0.3, latency: 0.3, stability: 0.1 };
    
    const weightedImprovement = (
      analysis.memory.improvementPercent * weights.memory +
      analysis.throughput.improvementPercent * weights.throughput +
      analysis.latency.improvementPercent * weights.latency +
      analysis.stability.improvementPercent * weights.stability
    );

    // 计算性能评分
    const performanceScore = Math.min(100, Math.max(0, 50 + weightedImprovement));

    // 确定整体状态
    let status: RegressionAnalysisResult['overall']['status'];
    if (weightedImprovement > 20) status = 'significant_improvement';
    else if (weightedImprovement > 5) status = 'minor_improvement';
    else if (weightedImprovement > -5) status = 'stable';
    else if (weightedImprovement > -20) status = 'minor_regression';
    else status = 'significant_regression';

    // 生成建议
    const recommendation = this.generateOverallRecommendation(analysis, weightedImprovement);

    return {
      performanceScore,
      improvementScore: weightedImprovement,
      status,
      recommendation
    };
  }

  /**
   * 分析目标达成情况
   */
  private analyzeGoalAchievement(baseline: BaselineData, current: BaselineData): RegressionAnalysisResult['goalAchievement'] {
    // 内存减少目标
    const memoryReductionTarget = PERFORMANCE_GOALS.MEMORY.REDUCTION_PERCENT;
    const memoryReductionAchieved = ((baseline.performanceMetrics.memory.averageMB - current.performanceMetrics.memory.averageMB) / baseline.performanceMetrics.memory.averageMB) * 100;

    // 吞吐量提升目标  
    const throughputImprovementTarget = PERFORMANCE_GOALS.THROUGHPUT.IMPROVEMENT_PERCENT;
    const throughputImprovementAchieved = ((current.performanceMetrics.throughput.averageMsgSec - baseline.performanceMetrics.throughput.averageMsgSec) / baseline.performanceMetrics.throughput.averageMsgSec) * 100;

    // 延迟降低目标
    const latencyReductionTarget = PERFORMANCE_GOALS.LATENCY.REDUCTION_PERCENT;
    const latencyReductionAchieved = ((baseline.performanceMetrics.latency.averageMs - current.performanceMetrics.latency.averageMs) / baseline.performanceMetrics.latency.averageMs) * 100;

    return {
      memoryReduction: {
        target: memoryReductionTarget,
        achieved: memoryReductionAchieved,
        success: memoryReductionAchieved >= memoryReductionTarget * 0.8 // 80%达成视为成功
      },
      throughputImprovement: {
        target: throughputImprovementTarget,
        achieved: throughputImprovementAchieved,
        success: throughputImprovementAchieved >= throughputImprovementTarget * 0.8
      },
      latencyReduction: {
        target: latencyReductionTarget,
        achieved: latencyReductionAchieved,
        success: latencyReductionAchieved >= latencyReductionTarget * 0.8
      }
    };
  }

  /**
   * 生成总体建议
   */
  private generateOverallRecommendation(analysis: RegressionAnalysisResult['analysis'], weightedImprovement: number): string {
    if (weightedImprovement > 20) {
      return '性能显著提升！建议继续保持当前的优化策略，并考虑将这些改进作为最佳实践推广。';
    } else if (weightedImprovement > 5) {
      return '性能有所改进。建议监控长期稳定性，确保改进能够持续。';
    } else if (weightedImprovement > -5) {
      return '性能基本稳定。建议持续监控关键指标，寻找进一步优化机会。';
    } else if (weightedImprovement > -20) {
      return '检测到轻微性能退化。建议审查最近的代码变更，重点关注性能影响较大的模块。';
    } else {
      return '检测到显著性能退化！建议立即回滚变更或进行紧急性能优化。';
    }
  }

  /**
   * 保存对比结果
   */
  private async saveComparisonResult(result: RegressionAnalysisResult): Promise<void> {
    await fs.ensureDir(TEST_CONFIG.BENCHMARKS_DIR);
    const filePath = path.join(TEST_CONFIG.BENCHMARKS_DIR, `regression-analysis-${result.comparisonId}.json`);
    await fs.writeJSON(filePath, result, { spaces: 2 });
  }

  /**
   * 生成报告摘要
   */
  private generateReportSummary(result: RegressionAnalysisResult): any {
    return {
      overallStatus: result.overall.status,
      performanceScore: result.overall.performanceScore.toFixed(1),
      improvementScore: result.overall.improvementScore.toFixed(1),
      keyFindings: [
        `内存使用: ${result.analysis.memory.status} (${result.analysis.memory.improvementPercent.toFixed(1)}%)`,
        `吞吐量: ${result.analysis.throughput.status} (${result.analysis.throughput.improvementPercent.toFixed(1)}%)`,
        `延迟: ${result.analysis.latency.status} (${result.analysis.latency.improvementPercent.toFixed(1)}%)`,
        `稳定性: ${result.analysis.stability.status} (${result.analysis.stability.improvementPercent.toFixed(1)}%)`
      ],
      goalAchievement: {
        memory: result.goalAchievement.memoryReduction.success,
        throughput: result.goalAchievement.throughputImprovement.success,
        latency: result.goalAchievement.latencyReduction.success
      }
    };
  }

  /**
   * 生成详细分析
   */
  private generateDetailedAnalysis(result: RegressionAnalysisResult): any {
    return {
      memory: {
        baseline: `${result.baseline.performanceMetrics.memory.averageMB.toFixed(2)} MB`,
        current: `${result.current.performanceMetrics.memory.averageMB.toFixed(2)} MB`,
        change: `${result.analysis.memory.improvement.toFixed(2)} MB (${result.analysis.memory.improvementPercent.toFixed(1)}%)`,
        status: result.analysis.memory.status,
        significance: result.analysis.memory.significance
      },
      throughput: {
        baseline: `${result.baseline.performanceMetrics.throughput.averageMsgSec.toFixed(2)} msg/sec`,
        current: `${result.current.performanceMetrics.throughput.averageMsgSec.toFixed(2)} msg/sec`,
        change: `${result.analysis.throughput.improvement.toFixed(2)} msg/sec (${result.analysis.throughput.improvementPercent.toFixed(1)}%)`,
        status: result.analysis.throughput.status,
        significance: result.analysis.throughput.significance
      },
      latency: {
        baseline: `${result.baseline.performanceMetrics.latency.averageMs.toFixed(2)} ms`,
        current: `${result.current.performanceMetrics.latency.averageMs.toFixed(2)} ms`,
        change: `${result.analysis.latency.improvement.toFixed(2)} ms (${result.analysis.latency.improvementPercent.toFixed(1)}%)`,
        status: result.analysis.latency.status,
        significance: result.analysis.latency.significance
      }
    };
  }

  /**
   * 生成目标达成报告
   */
  private generateGoalAchievementReport(result: RegressionAnalysisResult): any {
    return {
      memoryReduction: {
        target: `${result.goalAchievement.memoryReduction.target}%`,
        achieved: `${result.goalAchievement.memoryReduction.achieved.toFixed(1)}%`,
        success: result.goalAchievement.memoryReduction.success,
        status: result.goalAchievement.memoryReduction.success ? '✅ 达成' : '❌ 未达成'
      },
      throughputImprovement: {
        target: `${result.goalAchievement.throughputImprovement.target}%`,
        achieved: `${result.goalAchievement.throughputImprovement.achieved.toFixed(1)}%`,
        success: result.goalAchievement.throughputImprovement.success,
        status: result.goalAchievement.throughputImprovement.success ? '✅ 达成' : '❌ 未达成'
      },
      latencyReduction: {
        target: `${result.goalAchievement.latencyReduction.target}%`,
        achieved: `${result.goalAchievement.latencyReduction.achieved.toFixed(1)}%`,
        success: result.goalAchievement.latencyReduction.success,
        status: result.goalAchievement.latencyReduction.success ? '✅ 达成' : '❌ 未达成'
      }
    };
  }

  /**
   * 生成建议
   */
  private generateRecommendations(result: RegressionAnalysisResult): string[] {
    const recommendations: string[] = [];

    // 基于分析结果生成具体建议
    if (result.analysis.memory.status === 'degraded') {
      recommendations.push('内存使用退化：检查是否存在内存泄漏，优化数据结构和缓存策略。');
    }

    if (result.analysis.throughput.status === 'degraded') {
      recommendations.push('吞吐量下降：优化消息处理逻辑，检查是否存在性能瓶颈。');
    }

    if (result.analysis.latency.status === 'degraded') {
      recommendations.push('延迟增加：优化异步操作，减少不必要的等待时间。');
    }

    if (result.analysis.stability.status === 'degraded') {
      recommendations.push('稳定性下降：加强错误处理和连接管理，提高系统健壮性。');
    }

    // 目标未达成的建议
    if (!result.goalAchievement.memoryReduction.success) {
      recommendations.push('内存减少目标未达成：考虑进一步优化内存分配和垃圾回收策略。');
    }

    if (!result.goalAchievement.throughputImprovement.success) {
      recommendations.push('吞吐量提升目标未达成：考虑并行处理和批量处理优化。');
    }

    if (!result.goalAchievement.latencyReduction.success) {
      recommendations.push('延迟降低目标未达成：优化关键路径和减少序列化开销。');
    }

    // 通用建议
    recommendations.push(result.overall.recommendation);

    return recommendations;
  }

  /**
   * 生成文本报告
   */
  private async generateTextReport(report: any, result: RegressionAnalysisResult): Promise<string> {
    const textReport = `
# 性能回归分析报告

## 总体评估
- **整体状态**: ${result.overall.status}
- **性能评分**: ${result.overall.performanceScore.toFixed(1)}/100
- **改进评分**: ${result.overall.improvementScore.toFixed(1)}%
- **分析时间**: ${new Date(result.timestamp).toISOString()}

## 性能对比

### 内存使用
- **基线**: ${result.baseline.performanceMetrics.memory.averageMB.toFixed(2)} MB
- **当前**: ${result.current.performanceMetrics.memory.averageMB.toFixed(2)} MB
- **变化**: ${result.analysis.memory.improvement.toFixed(2)} MB (${result.analysis.memory.improvementPercent.toFixed(1)}%)
- **状态**: ${result.analysis.memory.status}

### 吞吐量
- **基线**: ${result.baseline.performanceMetrics.throughput.averageMsgSec.toFixed(2)} msg/sec
- **当前**: ${result.current.performanceMetrics.throughput.averageMsgSec.toFixed(2)} msg/sec
- **变化**: ${result.analysis.throughput.improvement.toFixed(2)} msg/sec (${result.analysis.throughput.improvementPercent.toFixed(1)}%)
- **状态**: ${result.analysis.throughput.status}

### 延迟
- **基线**: ${result.baseline.performanceMetrics.latency.averageMs.toFixed(2)} ms
- **当前**: ${result.current.performanceMetrics.latency.averageMs.toFixed(2)} ms
- **变化**: ${result.analysis.latency.improvement.toFixed(2)} ms (${result.analysis.latency.improvementPercent.toFixed(1)}%)
- **状态**: ${result.analysis.latency.status}

## 目标达成情况

### 内存减少30%
- **目标**: ${result.goalAchievement.memoryReduction.target}%
- **达成**: ${result.goalAchievement.memoryReduction.achieved.toFixed(1)}%
- **结果**: ${result.goalAchievement.memoryReduction.success ? '✅ 达成' : '❌ 未达成'}

### 吞吐量提升87.5%
- **目标**: ${result.goalAchievement.throughputImprovement.target}%
- **达成**: ${result.goalAchievement.throughputImprovement.achieved.toFixed(1)}%
- **结果**: ${result.goalAchievement.throughputImprovement.success ? '✅ 达成' : '❌ 未达成'}

### 延迟降低44.4%
- **目标**: ${result.goalAchievement.latencyReduction.target}%
- **达成**: ${result.goalAchievement.latencyReduction.achieved.toFixed(1)}%
- **结果**: ${result.goalAchievement.latencyReduction.success ? '✅ 达成' : '❌ 未达成'}

## 建议
${report.recommendations.map((rec: string, i: number) => `${i + 1}. ${rec}`).join('\n')}

---
报告生成时间: ${new Date().toISOString()}
`;

    const textReportPath = path.join(TEST_CONFIG.REPORTS_DIR, `regression-analysis-${result.comparisonId}.md`);
    await fs.writeFile(textReportPath, textReport.trim());

    return textReportPath;
  }
}