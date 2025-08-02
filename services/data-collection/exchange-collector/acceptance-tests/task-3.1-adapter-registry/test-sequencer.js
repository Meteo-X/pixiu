/**
 * Custom test sequencer for Task 3.1 acceptance tests
 * Ensures tests run in optimal order for reliability and performance
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define test priority order
    const testOrder = [
      // 1. Requirements acceptance tests (core functionality)
      'requirements.test.ts',
      
      // 2. API contract tests (interface validation)
      'api-contracts.test.ts',
      
      // 3. Component integration tests
      'component-integration.test.ts',
      
      // 4. System integration tests  
      'system-integration.test.ts',
      
      // 5. Performance tests
      'load-tests.test.ts',
      
      // 6. Regression tests
      'interface-stability.test.ts',
      
      // 7. Security tests (may be resource intensive)
      'access-control.test.ts'
    ];

    // Sort tests based on priority order
    const sortedTests = tests.sort((testA, testB) => {
      const getTestPriority = (test) => {
        const filename = test.path.split('/').pop();
        const index = testOrder.findIndex(order => filename?.includes(order));
        return index === -1 ? testOrder.length : index;
      };

      const priorityA = getTestPriority(testA);
      const priorityB = getTestPriority(testB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If same priority, sort alphabetically
      return testA.path.localeCompare(testB.path);
    });

    console.log('Test execution order:');
    sortedTests.forEach((test, index) => {
      const filename = test.path.split('/').pop();
      console.log(`  ${index + 1}. ${filename}`);
    });

    return sortedTests;
  }
}

module.exports = CustomSequencer;