/**
 * Jest setup file for Task 3.1 acceptance tests
 */

import { globalCache } from '@pixiu/shared-core';

// Global test configuration
jest.setTimeout(30000); // 30 seconds default timeout

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

// Global setup
beforeAll(async () => {
  // Initialize any global test dependencies
  console.log('Starting Task 3.1 Adapter Registry Acceptance Tests');
  console.log('Test Environment:', {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    pubsubEmulator: process.env.PUBSUB_EMULATOR_HOST
  });
});

// Global cleanup
afterAll(async () => {
  // Clean up global resources
  try {
    globalCache.destroy();
    console.log('Test cleanup completed');
  } catch (error) {
    console.warn('Error during test cleanup:', error);
  }
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Custom matchers
expect.extend({
  toBeValidTimestamp(received: any) {
    const pass = typeof received === 'string' && !isNaN(Date.parse(received));
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false,
      };
    }
  },
  
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveValidAdapterStructure(received: any) {
    const requiredFields = ['name', 'version', 'description', 'enabled', 'running', 'status', 'healthy'];
    const missingFields = requiredFields.filter(field => !(field in received));
    
    const pass = missingFields.length === 0;
    if (pass) {
      return {
        message: () => `expected adapter object not to have valid structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected adapter object to have valid structure, missing fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  }
});

// TypeScript declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTimestamp(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveValidAdapterStructure(): R;
    }
  }
}