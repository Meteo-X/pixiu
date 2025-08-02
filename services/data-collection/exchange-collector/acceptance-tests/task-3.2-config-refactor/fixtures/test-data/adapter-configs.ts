/**
 * 测试用适配器配置数据
 * 提供各种配置场景的测试数据
 */

import { 
  AdapterConfiguration, 
  PartialAdapterConfiguration,
  AdapterType,
  BinanceExtensions,
  OkxExtensions 
} from '../../../../../../src/config/adapter-config';
import { DataType } from '@pixiu/adapter-base';

/**
 * 有效的Binance适配器配置
 */
export const validBinanceConfig: AdapterConfiguration = {
  config: {
    enabled: true,
    connection: {
      timeout: 10000,
      maxRetries: 3,
      retryInterval: 5000,
      heartbeatInterval: 30000
    },
    endpoints: {
      ws: 'wss://stream.binance.com:9443/ws',
      rest: 'https://api.binance.com/api'
    },
    auth: {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret'
    }
  },
  subscription: {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M],
    enableAllTickers: false,
    customParams: {}
  },
  extensions: {
    testnet: false,
    enableCompression: true,
    enableCombinedStream: true,
    maxStreamCount: 1024
  } as BinanceExtensions
};

/**
 * 有效的OKX适配器配置
 */
export const validOkxConfig: AdapterConfiguration = {
  config: {
    enabled: true,
    connection: {
      timeout: 15000,
      maxRetries: 5,
      retryInterval: 3000,
      heartbeatInterval: 25000
    },
    endpoints: {
      ws: 'wss://ws.okx.com:8443/ws/v5/public',
      rest: 'https://www.okx.com'
    }
  },
  subscription: {
    symbols: ['BTC-USDT', 'ETH-USDT'],
    dataTypes: [DataType.TRADE, DataType.TICKER],
    enableAllTickers: false,
    customParams: {
      channel: 'tickers'
    }
  },
  extensions: {
    simulated: false,
    accountType: 'spot'
  } as OkxExtensions
};

/**
 * 最小有效配置
 */
export const minimalConfig: AdapterConfiguration = {
  config: {
    enabled: true,
    connection: {
      timeout: 5000,
      maxRetries: 1,
      retryInterval: 1000,
      heartbeatInterval: 10000
    },
    endpoints: {
      ws: 'wss://example.com/ws',
      rest: 'https://example.com/api'
    }
  },
  subscription: {
    symbols: ['TESTUSDT'],
    dataTypes: [DataType.TRADE]
  }
};

/**
 * 部分配置用于更新测试
 */
export const partialConfigUpdate: PartialAdapterConfiguration = {
  config: {
    connection: {
      timeout: 20000,
      maxRetries: 5
    }
  },
  subscription: {
    symbols: ['ADAUSDT', 'DOTUSDT'],
    dataTypes: [DataType.TICKER, DataType.KLINE_1H]
  }
};

/**
 * 无效配置 - 缺少必要字段
 */
export const invalidConfigMissingFields = {
  config: {
    enabled: true,
    // 缺少connection和endpoints
  },
  subscription: {
    // 缺少symbols和dataTypes
  }
};

/**
 * 无效配置 - 错误的数据类型
 */
export const invalidConfigWrongTypes: PartialAdapterConfiguration = {
  config: {
    enabled: true,
    connection: {
      timeout: 'invalid' as any, // 应该是number
      maxRetries: -1, // 应该是正数
      retryInterval: 100, // 太小
      heartbeatInterval: 1000 // 太小
    },
    endpoints: {
      ws: 'invalid-url',
      rest: 'also-invalid'
    }
  },
  subscription: {
    symbols: [] as any, // 空数组
    dataTypes: ['invalid-type'] as any, // 无效的数据类型
    enableAllTickers: 'yes' as any // 应该是boolean
  }
};

/**
 * 大型配置 - 用于性能测试
 */
export const largeConfig: AdapterConfiguration = {
  config: {
    enabled: true,
    connection: {
      timeout: 10000,
      maxRetries: 3,
      retryInterval: 5000,
      heartbeatInterval: 30000
    },
    endpoints: {
      ws: 'wss://stream.binance.com:9443/ws',
      rest: 'https://api.binance.com/api'
    }
  },
  subscription: {
    symbols: Array.from({ length: 1000 }, (_, i) => `SYMBOL${i}USDT`),
    dataTypes: Object.values(DataType),
    enableAllTickers: true,
    customParams: {
      param1: 'value1',
      param2: 'value2',
      param3: { nested: 'object' },
      param4: [1, 2, 3, 4, 5]
    }
  },
  extensions: {
    testnet: false,
    enableCompression: true,
    enableCombinedStream: true,
    maxStreamCount: 1024,
    customExtension1: 'value1',
    customExtension2: { complex: 'object' }
  }
};

/**
 * 多适配器配置集合
 */
export const multiAdapterConfigs = {
  binance: validBinanceConfig,
  okx: validOkxConfig,
  huobi: {
    config: {
      enabled: false,
      connection: {
        timeout: 8000,
        maxRetries: 2,
        retryInterval: 3000,
        heartbeatInterval: 20000
      },
      endpoints: {
        ws: 'wss://api.huobi.pro/ws',
        rest: 'https://api.huobi.pro'
      }
    },
    subscription: {
      symbols: ['btcusdt', 'ethusdt'],
      dataTypes: [DataType.TRADE, DataType.DEPTH],
      enableAllTickers: false
    }
  } as AdapterConfiguration
};

/**
 * 环境特定配置
 */
export const environmentConfigs = {
  development: {
    config: {
      enabled: true,
      connection: {
        timeout: 5000,
        maxRetries: 1,
        retryInterval: 1000,
        heartbeatInterval: 10000
      },
      endpoints: {
        ws: 'wss://testnet.binance.vision/ws',
        rest: 'https://testnet.binance.vision/api'
      }
    },
    subscription: {
      symbols: ['BTCUSDT'],
      dataTypes: [DataType.TRADE],
      enableAllTickers: false
    },
    extensions: {
      testnet: true,
      enableCompression: false
    }
  } as AdapterConfiguration,
  
  production: {
    config: {
      enabled: true,
      connection: {
        timeout: 15000,
        maxRetries: 5,
        retryInterval: 10000,
        heartbeatInterval: 60000
      },
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      },
      auth: {
        apiKey: '${BINANCE_API_KEY}',
        apiSecret: '${BINANCE_API_SECRET}'
      }
    },
    subscription: {
      symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'],
      dataTypes: [DataType.TRADE, DataType.TICKER, DataType.KLINE_1M],
      enableAllTickers: false
    },
    extensions: {
      testnet: false,
      enableCompression: true,
      enableCombinedStream: true,
      maxStreamCount: 1024
    }
  } as AdapterConfiguration
};

/**
 * 迁移场景配置 - 从旧格式到新格式
 */
export const legacyConfigs = {
  // 模拟旧的Binance特定配置格式
  oldBinanceConfig: {
    exchange: 'binance',
    apiUrl: 'https://api.binance.com',
    wsUrl: 'wss://stream.binance.com:9443/ws',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    dataTypes: ['trade', 'ticker'],
    timeout: 10000,
    maxRetries: 3,
    enableTestnet: false
  },
  
  // 期望的新格式
  expectedNewFormat: validBinanceConfig
};

/**
 * 安全测试配置 - 包含敏感数据
 */
export const securityTestConfigs = {
  withSecrets: {
    config: {
      enabled: true,
      connection: {
        timeout: 10000,
        maxRetries: 3,
        retryInterval: 5000,
        heartbeatInterval: 30000
      },
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      },
      auth: {
        apiKey: 'super-secret-api-key-123456',
        apiSecret: 'super-secret-api-secret-abcdef'
      }
    },
    subscription: {
      symbols: ['BTCUSDT'],
      dataTypes: [DataType.TRADE]
    }
  } as AdapterConfiguration,
  
  withoutSecrets: {
    config: {
      enabled: true,
      connection: {
        timeout: 10000,
        maxRetries: 3,
        retryInterval: 5000,
        heartbeatInterval: 30000
      },
      endpoints: {
        ws: 'wss://stream.binance.com:9443/ws',
        rest: 'https://api.binance.com/api'
      }
    },
    subscription: {
      symbols: ['BTCUSDT'],
      dataTypes: [DataType.TRADE]
    }
  } as AdapterConfiguration
};

/**
 * 边界条件测试配置
 */
export const boundaryTestConfigs = {
  maxValues: {
    config: {
      enabled: true,
      connection: {
        timeout: Number.MAX_SAFE_INTEGER,
        maxRetries: 1000,
        retryInterval: 3600000, // 1小时
        heartbeatInterval: 86400000 // 24小时
      },
      endpoints: {
        ws: 'wss://example.com/ws',
        rest: 'https://example.com/api'
      }
    },
    subscription: {
      symbols: Array.from({ length: 10000 }, (_, i) => `SYM${i}`),
      dataTypes: Object.values(DataType)
    }
  } as AdapterConfiguration,
  
  minValues: {
    config: {
      enabled: true,
      connection: {
        timeout: 1000,
        maxRetries: 0,
        retryInterval: 1000,
        heartbeatInterval: 5000
      },
      endpoints: {
        ws: 'ws://localhost',
        rest: 'http://localhost'
      }
    },
    subscription: {
      symbols: ['A'],
      dataTypes: [DataType.TRADE]
    }
  } as AdapterConfiguration
};

/**
 * 获取所有测试配置的映射
 */
export const allTestConfigs = {
  validBinanceConfig,
  validOkxConfig,
  minimalConfig,
  partialConfigUpdate,
  invalidConfigMissingFields,
  invalidConfigWrongTypes,
  largeConfig,
  multiAdapterConfigs,
  environmentConfigs,
  legacyConfigs,
  securityTestConfigs,
  boundaryTestConfigs
};

/**
 * 适配器类型映射
 */
export const adapterTypeMapping = {
  binance: AdapterType.BINANCE,
  okx: AdapterType.OKEX,
  huobi: AdapterType.HUOBI,
  coinbase: AdapterType.COINBASE
};