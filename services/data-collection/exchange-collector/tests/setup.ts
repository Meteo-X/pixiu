/**
 * Exchange Collector测试设置 - 使用@pixiu/test-utils统一配置
 */

import { setupTests } from '@pixiu/test-utils';

// 使用自定义配置，设置较长的超时时间以适应复杂的数据流测试
setupTests({
  timeout: 15000,
  console: 'quiet',
  enablePubSubMock: true,
  enableWebSocketMock: true,
  enableGlobalCacheCleanup: true
});