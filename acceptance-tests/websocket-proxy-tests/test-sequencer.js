const Sequencer = require('@jest/test-sequencer').default;

/**
 * 自定义测试序列器
 * 确保测试按照逻辑顺序执行，避免资源冲突
 */
class WebSocketProxyTestSequencer extends Sequencer {
  sort(tests) {
    // 测试文件执行优先级定义
    const testPriorities = {
      // 基础功能测试 - 最高优先级
      'connection-management': 1,
      'basic-connection': 1,
      'connection-lifecycle': 1,
      'connection-pool': 1,
      
      // 消息处理测试
      'message-forwarding': 2,
      'message-processing': 2,
      'message-broadcasting': 2,
      
      // 订阅功能测试
      'subscription-management': 3,
      'subscription-filtering': 3,
      'subscription-optimization': 3,
      
      // 集成测试
      'integration': 4,
      'dataflow-integration': 4,
      'compatibility': 4,
      
      // 性能测试 - 较低优先级（需要更多资源）
      'performance': 5,
      'load-testing': 5,
      'stress-testing': 5,
      'memory-testing': 5,
      
      // 故障处理测试 - 最低优先级（可能影响其他测试）
      'fault-tolerance': 6,
      'error-handling': 6,
      'recovery-testing': 6,
      
      // 端到端测试 - 最后执行
      'e2e': 7,
      'end-to-end': 7
    };
    
    // 获取测试文件的优先级
    const getTestPriority = (testPath) => {
      const fileName = testPath.toLowerCase();
      
      // 检查文件名中的关键词
      for (const [keyword, priority] of Object.entries(testPriorities)) {
        if (fileName.includes(keyword)) {
          return priority;
        }
      }
      
      // 默认优先级
      return 99;
    };
    
    // 按优先级和文件名排序
    return tests.sort((testA, testB) => {
      const priorityA = getTestPriority(testA.path);
      const priorityB = getTestPriority(testB.path);
      
      // 首先按优先级排序
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // 相同优先级的测试按文件名排序
      return testA.path.localeCompare(testB.path);
    });
  }
}

module.exports = WebSocketProxyTestSequencer;