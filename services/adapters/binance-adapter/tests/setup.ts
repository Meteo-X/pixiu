// Jest setup file for Binance Adapter tests

// Set test timeout
jest.setTimeout(30000);

// Mock console methods in test environment
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTimestamp(): R;
      toBeValidMarketData(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidTimestamp(received: unknown) {
    const pass = typeof received === 'number' && received > 0 && received <= Date.now();
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

  toBeValidMarketData(received: unknown) {
    const isObject = typeof received === 'object' && received !== null;
    if (!isObject) {
      return {
        message: () => `expected ${received} to be an object`,
        pass: false,
      };
    }

    const data = received as Record<string, unknown>;
    const hasRequiredFields = 
      typeof data.exchange === 'string' &&
      typeof data.symbol === 'string' &&
      typeof data.timestamp === 'number' &&
      typeof data.type === 'string' &&
      data.data !== undefined;

    if (hasRequiredFields) {
      return {
        message: () => `expected ${received} not to be valid market data`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be valid market data with exchange, symbol, timestamp, type, and data fields`,
        pass: false,
      };
    }
  },
});