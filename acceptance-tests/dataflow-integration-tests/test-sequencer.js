/**
 * Jest测试序列化器
 * 确保测试按正确顺序执行，避免并发冲突
 */

const Sequencer = require('@jest/test-sequencer').default;

class DataFlowTestSequencer extends Sequencer {
  /**
   * 定义测试执行顺序
   * 优先级: 单元测试 > 集成测试 > 端到端测试 > 性能测试 > 压力测试
   */
  sort(tests) {
    const testOrder = [
      // 1. 基础设施和工具测试
      'fixtures',
      'helpers', 
      'mocks',
      
      // 2. 单元测试
      'unit',
      
      // 3. 集成测试 - 按依赖顺序
      'integration/data-transformer',
      'integration/message-router',
      'integration/output-channels',
      'integration/dataflow-manager',
      
      // 4. 端到端测试
      'e2e/basic-flow',
      'e2e/multi-channel',
      'e2e/complex-routing',
      
      // 5. 回归测试
      'regression',
      
      // 6. 安全测试
      'security',
      
      // 7. 监控和可观测性测试
      'monitoring',
      
      // 8. 性能测试
      'performance/latency',
      'performance/throughput',
      'performance/memory',
      
      // 9. 压力和稳定性测试
      'stress',
      'stability'
    ];

    // 获取测试的优先级
    const getTestPriority = (testPath) => {
      for (let i = 0; i < testOrder.length; i++) {
        if (testPath.includes(testOrder[i])) {
          return i;
        }
      }
      return testOrder.length; // 未匹配的测试放在最后
    };

    // 按优先级排序
    const sortedTests = tests.sort((testA, testB) => {
      const priorityA = getTestPriority(testA.path);
      const priorityB = getTestPriority(testB.path);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 优先级相同时，按文件名字母顺序排序
      return testA.path.localeCompare(testB.path);
    });

    console.log('\n📋 测试执行顺序:');
    sortedTests.forEach((test, index) => {
      const relativePath = test.path.replace(process.cwd(), '');
      console.log(`  ${index + 1}. ${relativePath}`);
    });
    console.log();

    return sortedTests;
  }
}

module.exports = DataFlowTestSequencer;