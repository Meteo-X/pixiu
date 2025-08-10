const DefaultSequencer = require('@jest/test-sequencer').default;

/**
 * 自定义测试排序器
 * 确保测试按照正确的顺序执行
 */
class CustomSequencer extends DefaultSequencer {
  sort(tests) {
    // 定义测试执行优先级
    const priorities = {
      // 基础功能测试优先
      'basic-connection': 1,
      'stream-management': 2,
      'binance-metrics': 3,
      
      // 错误处理和恢复测试
      'error-classification': 4,
      'recovery-strategies': 5,
      'circuit-breaker': 6,
      
      // 性能监控测试
      'resource-monitoring': 7,
      'performance-optimization': 8,
      'health-checks': 9,
      
      // 集成测试
      'framework-integration': 10,
      'lifecycle-management': 11,
      'event-system': 12,
      
      // 边界和压力测试
      'connection-limits': 13,
      'stress-testing': 14,
      'memory-management': 15,
      
      // 默认优先级
      'default': 100
    };
    
    return tests.sort((a, b) => {
      // 获取测试文件的优先级
      const getPriority = (testPath) => {
        for (const [key, priority] of Object.entries(priorities)) {
          if (testPath.includes(key)) {
            return priority;
          }
        }
        return priorities.default;
      };
      
      const aPriority = getPriority(a.path);
      const bPriority = getPriority(b.path);
      
      // 按优先级排序，然后按文件名排序
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = CustomSequencer;