/**
 * Jest setup for Task 3.3 Data Pipeline Refactoring acceptance tests
 */

import { globalCache } from '@pixiu/shared-core';

// Increase timeout for performance tests
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Initialize any global resources
  console.log('Setting up Task 3.3 Data Pipeline Refactoring acceptance tests...');
});

// Global test teardown  
afterAll(async () => {
  // Clean up global resources
  try {
    globalCache.destroy();
  } catch (error) {
    console.warn('Error during global cleanup:', error);
  }
  
  console.log('Cleaning up Task 3.3 Data Pipeline Refactoring acceptance tests...');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Set up global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(min: number, max: number): R;
      toMatchMemoryUsage(expected: { max: number; min?: number }): R;
      toHaveLatencyBelow(maxLatency: number): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${min} - ${max}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${min} - ${max}`,
        pass: false,
      };
    }
  },
  
  toMatchMemoryUsage(received: { heapUsed: number }, expected: { max: number; min?: number }) {
    const min = expected.min || 0;
    const max = expected.max;
    const heapUsed = received.heapUsed;
    const pass = heapUsed >= min && heapUsed <= max;
    
    if (pass) {
      return {
        message: () => `expected memory usage ${heapUsed} not to be within ${min} - ${max}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected memory usage ${heapUsed} to be within ${min} - ${max}`,
        pass: false,
      };
    }
  },
  
  toHaveLatencyBelow(received: number, maxLatency: number) {
    const pass = received < maxLatency;
    if (pass) {
      return {
        message: () => `expected latency ${received}ms not to be below ${maxLatency}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected latency ${received}ms to be below ${maxLatency}ms`,
        pass: false,
      };
    }
  }
});