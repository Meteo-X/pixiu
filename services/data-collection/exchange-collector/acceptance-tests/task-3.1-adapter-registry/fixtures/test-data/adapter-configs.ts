/**
 * Test adapter configurations and integration configs
 */

import { IntegrationConfig } from '../../../../src/adapters/base/adapter-integration';
import { DataType } from '@pixiu/adapter-base';

export const testAdapterConfigs = {
  validBinanceConfig: {
    exchange: 'binance',
    endpoints: {
      ws: 'wss://testnet.binance.vision/ws',
      rest: 'https://testnet.binance.vision/api'
    },
    connection: {
      timeout: 5000,
      maxRetries: 2,
      retryInterval: 2000,
      heartbeatInterval: 15000
    },
    binance: {
      testnet: true,
      enableCompression: false
    },
    subscription: {
      symbols: ['BTCUSDT', 'ETHUSDT'],
      dataTypes: [DataType.TRADE, DataType.TICKER],
      enableAllTickers: false
    }
  },

  validMockConfig: {
    exchange: 'mock',
    endpoints: {
      ws: 'ws://localhost:9999/mock',
      rest: 'http://localhost:9999/api'
    },
    connection: {
      timeout: 3000,
      maxRetries: 1,
      retryInterval: 1000,
      heartbeatInterval: 10000
    },
    subscription: {
      symbols: ['TESTUSDT'],
      dataTypes: [DataType.TRADE]
    }
  },

  invalidConfig: {
    exchange: 'invalid',
    endpoints: {
      ws: 'invalid-url',
      rest: 'invalid-url'
    },
    connection: {
      timeout: -1000,
      maxRetries: -1,
      retryInterval: -500,
      heartbeatInterval: -10000
    },
    subscription: {
      symbols: [],
      dataTypes: ['invalid-type' as any]
    }
  }
};

export const testIntegrationConfigs: Record<string, IntegrationConfig> = {
  binanceIntegration: {
    adapterConfig: testAdapterConfigs.validBinanceConfig,
    publishConfig: {
      topicPrefix: 'test-market-data',
      enableBatching: false,
      batchSize: 10,
      batchTimeout: 500
    },
    monitoringConfig: {
      enableMetrics: true,
      enableHealthCheck: true,
      metricsInterval: 5000
    }
  },

  mockIntegration: {
    adapterConfig: testAdapterConfigs.validMockConfig,
    publishConfig: {
      topicPrefix: 'test-market-data',
      enableBatching: false,
      batchSize: 1,
      batchTimeout: 100
    },
    monitoringConfig: {
      enableMetrics: true,
      enableHealthCheck: true,
      metricsInterval: 3000
    }
  },

  batchedIntegration: {
    adapterConfig: testAdapterConfigs.validBinanceConfig,
    publishConfig: {
      topicPrefix: 'test-market-data',
      enableBatching: true,
      batchSize: 50,
      batchTimeout: 2000
    },
    monitoringConfig: {
      enableMetrics: true,
      enableHealthCheck: true,
      metricsInterval: 5000
    }
  },

  minimalIntegration: {
    adapterConfig: {
      exchange: 'minimal',
      endpoints: {
        ws: 'ws://localhost:9996/minimal',
        rest: 'http://localhost:9996/api'
      },
      connection: {
        timeout: 1000,
        maxRetries: 0,
        retryInterval: 500,
        heartbeatInterval: 5000
      },
      subscription: {
        symbols: ['MINUSDT'],
        dataTypes: [DataType.TRADE]
      }
    },
    publishConfig: {
      topicPrefix: 'minimal-data',
      enableBatching: false,
      batchSize: 1,
      batchTimeout: 100
    },
    monitoringConfig: {
      enableMetrics: false,
      enableHealthCheck: false,
      metricsInterval: 10000
    }
  }
};

export const testRegistryEntries = {
  binance: {
    version: '1.0.0',
    description: 'Binance exchange adapter integration',
    supportedFeatures: ['websocket', 'trades', 'tickers', 'klines', 'depth'],
    enabled: true,
    metadata: {
      testnet: true,
      compression: false
    }
  },

  mock: {
    version: '1.0.0-test',
    description: 'Mock exchange adapter for testing',
    supportedFeatures: ['websocket', 'trades'],
    enabled: true,
    metadata: {
      testAdapter: true,
      mock: true
    }
  },

  disabled: {
    version: '1.0.0',
    description: 'Disabled adapter for testing',
    supportedFeatures: ['websocket'],
    enabled: false,
    metadata: {
      disabled: true
    }
  }
};

export const testMarketData = {
  validTradeData: {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    type: DataType.TRADE,
    timestamp: Date.now(),
    data: {
      price: '45000.00',
      quantity: '0.001',
      side: 'buy',
      tradeId: '12345',
      eventTime: Date.now()
    },
    receivedAt: Date.now()
  },

  validTickerData: {
    exchange: 'binance',
    symbol: 'ETHUSDT',
    type: DataType.TICKER,
    timestamp: Date.now(),
    data: {
      symbol: 'ETHUSDT',
      price: '3000.00',
      priceChange: '50.00',
      priceChangePercent: '1.69',
      volume: '1000.00',
      count: 500
    },
    receivedAt: Date.now()
  },

  invalidData: {
    exchange: null,
    symbol: '',
    type: 'invalid-type',
    timestamp: 'invalid-timestamp',
    data: null
  }
};

export const performanceCriteria = {
  serviceStartup: {
    maxTime: 5000,      // 5 seconds max startup time
    description: 'Service should start within 5 seconds'
  },
  
  adapterRegistration: {
    maxTime: 100,       // 100ms max registration time
    description: 'Adapter registration should complete within 100ms'
  },
  
  instanceCreation: {
    maxTime: 2000,      // 2 seconds max instance creation time
    description: 'Adapter instance creation should complete within 2 seconds'
  },
  
  instanceStart: {
    maxTime: 3000,      // 3 seconds max instance start time
    description: 'Adapter instance start should complete within 3 seconds'
  },
  
  instanceStop: {
    maxTime: 2000,      // 2 seconds max instance stop time
    description: 'Adapter instance stop should complete within 2 seconds'
  },
  
  healthCheck: {
    maxTime: 50,        // 50ms max health check response time
    description: 'Health check should respond within 50ms'
  },
  
  apiResponse: {
    maxTime: 200,       // 200ms max API response time
    description: 'API endpoints should respond within 200ms'
  },
  
  concurrentOperations: {
    maxAdapters: 10,    // Support up to 10 concurrent adapters
    description: 'Should support up to 10 concurrent adapter instances'
  }
};

export const securityTestData = {
  unauthorizedApiAccess: {
    description: 'Test unauthorized API access attempts',
    testCases: [
      { endpoint: '/api/adapters', method: 'GET' },
      { endpoint: '/api/adapters/binance/start', method: 'POST' },
      { endpoint: '/api/adapters/binance/stop', method: 'POST' }
    ]
  },
  
  invalidInputs: {
    description: 'Test API endpoints with malicious inputs',
    testCases: [
      { payload: { adapterConfig: '../../etc/passwd' } },
      { payload: { adapterConfig: { injection: '<script>alert("xss")</script>' } } },
      { payload: { enabled: 'DROP TABLE adapters;' } }
    ]
  },
  
  configurationSecurity: {
    description: 'Test configuration security requirements',
    testCases: [
      'Sensitive data should not be logged',
      'API keys should be masked in responses',
      'Configuration should be validated for security'
    ]
  }
};