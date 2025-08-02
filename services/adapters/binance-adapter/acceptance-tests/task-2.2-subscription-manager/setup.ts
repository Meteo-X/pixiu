/**
 * Global test setup for Task 2.2 Subscription Manager acceptance tests
 * 
 * This file configures the test environment, including:
 * - Custom matchers and assertions
 * - Global test utilities
 * - Environment configuration
 * - Cleanup procedures
 */

import { EventEmitter } from 'events';

// Increase EventEmitter listener limit for tests
EventEmitter.defaultMaxListeners = 20;

// Configure test timeouts
jest.setTimeout(30000);

// Global test configuration
const globalTestConfig = {
  timeout: {
    default: 5000,
    integration: 10000,
    performance: 30000
  },
  retries: {
    default: 2,
    flaky: 3
  },
  thresholds: {
    performance: {
      streamNameBuilding: 1000, // microseconds
      subscriptionManagement: 5000, // microseconds
      memoryUsage: 50 * 1024 * 1024, // 50MB
      subscriptionCount: 10000
    }
  }
};

// Make config available globally
declare global {
  var testConfig: typeof globalTestConfig;
  var testUtils: {
    createTestSubscription: (overrides?: any) => any;
    createTestConfig: (overrides?: any) => any;
    waitFor: (condition: () => boolean, timeout?: number) => Promise<void>;
    measurePerformance: <T>(fn: () => T) => { result: T; duration: number };
    createMockEventEmitter: () => EventEmitter;
  };
}

global.testConfig = globalTestConfig;

// Test utilities
global.testUtils = {
  /**
   * Create a test subscription with default values
   */
  createTestSubscription: (overrides = {}) => ({
    symbol: 'BTCUSDT',
    dataType: 'trade',
    params: undefined,
    ...overrides
  }),

  /**
   * Create a test configuration with default values
   */
  createTestConfig: (overrides = {}) => ({
    baseWsUrl: 'wss://stream.binance.com:9443',
    maxStreamsPerConnection: 1024,
    subscriptionTimeout: 5000,
    autoResubscribe: true,
    retryConfig: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true
    },
    validation: {
      strictValidation: true,
      symbolPattern: /^[A-Z0-9]+$/,
      maxSubscriptions: 10000,
      disabledDataTypes: []
    },
    ...overrides
  }),

  /**
   * Wait for a condition to be true with timeout
   */
  waitFor: async (condition: () => boolean, timeout = 5000): Promise<void> => {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  /**
   * Measure performance of a function
   */
  measurePerformance: <T>(fn: () => T): { result: T; duration: number } => {
    const start = process.hrtime.bigint();
    const result = fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000; // Convert to microseconds
    
    return { result, duration };
  },

  /**
   * Create a mock EventEmitter for testing
   */
  createMockEventEmitter: (): EventEmitter => {
    const emitter = new EventEmitter();
    
    // Add debugging capabilities
    const originalEmit = emitter.emit;
    emitter.emit = function(event: string | symbol, ...args: any[]) {
      if (process.env['DEBUG_EVENTS'] === 'true') {
        console.log(`Event emitted: ${String(event)}`, args);
      }
      return originalEmit.call(this, event, ...args);
    };
    
    return emitter;
  }
};

// Custom Jest matchers
expect.extend({
  /**
   * Check if a stream name follows Binance naming convention
   */
  toBeBinanceStreamName(received: string) {
    const patterns = [
      /^[a-z0-9]+@trade$/,                    // trade
      /^[a-z0-9]+@ticker$/,                   // ticker  
      /^[a-z0-9]+@depth(\d+)?(@\d+ms)?$/,     // depth
      /^[a-z0-9]+@kline_[1-9]\d*[mhd]$/,      // kline
    ];

    const pass = patterns.some(pattern => pattern.test(received));
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Binance stream name`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Binance stream name`,
        pass: false,
      };
    }
  },

  /**
   * Check if performance metrics meet thresholds
   */
  toMeetPerformanceThreshold(received: number, threshold: number, unit: string = 'ms') {
    const pass = received <= threshold;
    
    if (pass) {
      return {
        message: () => `expected ${received}${unit} to exceed threshold ${threshold}${unit}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received}${unit} to be within threshold ${threshold}${unit}`,
        pass: false,
      };
    }
  },

  /**
   * Check if subscription result has expected structure
   */
  toBeValidSubscriptionResult(received: any) {
    const requiredFields = ['success', 'successful', 'failed', 'existing', 'summary'];
    const summaryFields = ['total', 'successful', 'failed', 'existing'];
    
    const hasRequiredFields = requiredFields.every(field => field in received);
    const hasValidSummary = summaryFields.every(field => field in received.summary);
    const hasValidArrays = Array.isArray(received.successful) && 
                          Array.isArray(received.failed) && 
                          Array.isArray(received.existing);
    
    const pass = hasRequiredFields && hasValidSummary && hasValidArrays;
    
    if (pass) {
      return {
        message: () => `expected object not to be a valid subscription result`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected object to be a valid subscription result with required fields`,
        pass: false,
      };
    }
  }
});

// Extend Jest matchers type definitions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeBinanceStreamName(): R;
      toMeetPerformanceThreshold(threshold: number, unit?: string): R;
      toBeValidSubscriptionResult(): R;
    }
  }
}

// Global test setup
beforeAll(async () => {
  // Setup any global resources
  console.log('🚀 Starting Task 2.2 Subscription Manager acceptance tests');
  
  // Verify test environment
  if (!process.env['NODE_ENV']) {
    process.env['NODE_ENV'] = 'test';
  }
  
  // Setup test database or external services if needed
  // This would typically include:
  // - Starting test databases
  // - Initializing mock services
  // - Setting up test configuration
});

afterAll(async () => {
  // Cleanup global resources
  console.log('🧹 Cleaning up after Task 2.2 acceptance tests');
  
  // Cleanup any global resources:
  // - Close database connections
  // - Stop mock services
  // - Clear temporary files
});

// Global error handlers for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, but log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, but log the error
});

// Console override for cleaner test output
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Filter out expected errors in tests
  const message = args.join(' ');
  if (message.includes('Warning: ') || message.includes('ECONNREFUSED')) {
    return; // Suppress expected test warnings
  }
  originalConsoleError.apply(console, args);
};

// Test environment validation
if (process.env['CI'] === 'true') {
  console.log('🤖 Running in CI environment');
  // Set CI-specific configurations
  jest.setTimeout(60000); // Longer timeout for CI
}

export {};