/**
 * Jest测试执行顺序控制器
 * 确保测试按照逻辑顺序执行，优先运行基础功能测试
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  /**
   * 自定义测试排序逻辑
   * 按以下优先级执行：
   * 1. 需求验收测试 (requirements)
   * 2. API契约测试 (api-contracts) 
   * 3. 集成测试 (integration)
   * 4. 性能测试 (performance)
   * 5. 安全测试 (security)
   * 6. 回归测试 (regression)
   */
  sort(tests) {
    // 定义测试优先级
    const testPriority = {
      'requirements': 1,
      'api-contracts': 2,
      'component-integration': 3,
      'system-integration': 4,
      'environment-validation': 5,
      'load-tests': 6,
      'memory-usage': 7,
      'response-time': 8,
      'authentication': 9,
      'data-protection': 10,
      'access-control': 11,
      'interface-stability': 12,
      'behavior-consistency': 13,
      'compatibility': 14
    };

    // 获取测试文件的优先级
    const getTestPriority = (testPath) => {
      const path = testPath.toLowerCase();
      
      // 查找匹配的测试类型
      for (const [type, priority] of Object.entries(testPriority)) {
        if (path.includes(type)) {
          return priority;
        }
      }
      
      // 默认优先级
      return 999;
    };

    // 按优先级排序
    const sortedTests = tests.sort((testA, testB) => {
      const priorityA = getTestPriority(testA.path);
      const priorityB = getTestPriority(testB.path);
      
      // 首先按优先级排序
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 相同优先级按文件名排序
      return testA.path.localeCompare(testB.path);
    });

    // 输出测试执行顺序
    console.log('📋 测试执行顺序:');
    sortedTests.forEach((test, index) => {
      const testName = test.path.split('/').pop();
      const priority = getTestPriority(test.path);
      console.log(`  ${index + 1}. ${testName} (优先级: ${priority})`);
    });

    return sortedTests;
  }
}

module.exports = CustomSequencer;