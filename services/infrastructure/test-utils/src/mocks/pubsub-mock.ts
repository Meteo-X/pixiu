/**
 * Google Cloud PubSub Mock 工具
 * 提供统一的PubSub模拟实现
 */

interface MockMessage {
  data: Buffer;
  attributes: Record<string, string>;
  messageId?: string;
}

interface MockSubscription {
  on: jest.MockedFunction<any>;
  removeAllListeners: jest.MockedFunction<any>;
  close: jest.MockedFunction<any>;
  setOptions: jest.MockedFunction<any>;
}

interface MockTopic {
  publishMessage: jest.MockedFunction<(message: MockMessage) => Promise<string[]>>;
  createSubscription: jest.MockedFunction<any>;
  delete: jest.MockedFunction<any>;
}

interface MockPubSub {
  topic: jest.MockedFunction<(name: string) => MockTopic>;
  subscription: jest.MockedFunction<(name: string) => MockSubscription>;
  createTopic: jest.MockedFunction<any>;
  close: jest.MockedFunction<any>;
}

/**
 * 创建PubSub Mock
 */
export function createPubSubMock(): MockPubSub {
  const mockTopic: MockTopic = {
    publishMessage: jest.fn().mockResolvedValue(['mock-message-id']),
    createSubscription: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue([])
  };

  const mockSubscription: MockSubscription = {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    setOptions: jest.fn()
  };

  const mockPubSub: MockPubSub = {
    topic: jest.fn().mockReturnValue(mockTopic),
    subscription: jest.fn().mockReturnValue(mockSubscription),
    createTopic: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined)
  };

  return mockPubSub;
}

/**
 * 安装PubSub模拟
 */
export function mockPubSub(): void {
  const pubsubMock = createPubSubMock();
  
  jest.mock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => pubsubMock)
  }));
}

/**
 * PubSub Mock 类型导出
 */
export type { MockPubSub, MockTopic, MockSubscription, MockMessage };