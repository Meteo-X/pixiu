/**
 * @pixiu/test-utils - Pixiu项目共享测试工具包
 * 
 * 提供统一的测试工具、Mock和设置功能，减少重复的测试代码
 * 
 * @example
 * ```typescript
 * // 基础用法
 * import { setupTests } from '@pixiu/test-utils';
 * setupTests(); // 使用默认配置
 * 
 * // 自定义配置
 * import { setupTests, SETUP_CONFIGS } from '@pixiu/test-utils';
 * setupTests(SETUP_CONFIGS.SILENT);
 * 
 * // 单独使用Mock
 * import { mockPubSub, mockWebSocket } from '@pixiu/test-utils/mocks';
 * mockPubSub();
 * mockWebSocket();
 * ```
 */

// 主要设置工具
export {
  UnifiedTestSetup,
  createUnifiedSetup,
  globalTestSetup,
  setupTests,
  SETUP_CONFIGS
} from './setup/unified-setup';

// Mock工具
export {
  createPubSubMock,
  mockPubSub
} from './mocks/pubsub-mock';

export {
  createWebSocketMock,
  createControllableWebSocketMock,
  mockWebSocket,
  WS_STATES
} from './mocks/websocket-mock';

export {
  EnvMock,
  createEnvMock,
  envMock,
  DEFAULT_TEST_ENV
} from './mocks/env-mock';

export {
  ConsoleMock,
  createConsoleMock,
  CONSOLE_MOCK_CONFIGS
} from './mocks/console-mock';

// 类型导出
export type {
  UnifiedSetupConfig
} from './setup/unified-setup';

export type {
  MockPubSub,
  MockTopic,
  MockSubscription,
  MockMessage
} from './mocks/pubsub-mock';

export type {
  MockWebSocket
} from './mocks/websocket-mock';

// 版本信息
export const VERSION = '1.0.0';