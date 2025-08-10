/**
 * WebSocket Mock 工具
 * 提供统一的WebSocket模拟实现
 */

interface MockWebSocket {
  on: jest.MockedFunction<any>;
  send: jest.MockedFunction<any>;
  close: jest.MockedFunction<any>;
  ping: jest.MockedFunction<any>;
  readyState: number;
  OPEN: number;
  CLOSED: number;
  CONNECTING: number;
  CLOSING: number;
}

/**
 * WebSocket状态常量
 */
export const WS_STATES = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
} as const;

/**
 * 创建WebSocket Mock
 */
export function createWebSocketMock(initialState: number = WS_STATES.OPEN): MockWebSocket {
  const mockWebSocket: MockWebSocket = {
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    readyState: initialState,
    OPEN: 1,
    CLOSED: 3,
    CONNECTING: 0,
    CLOSING: 2
  };

  return mockWebSocket;
}

/**
 * 创建可控制状态的WebSocket Mock
 */
export function createControllableWebSocketMock(): {
  mock: MockWebSocket;
  setState: (state: number) => void;
  triggerEvent: (event: string, ...args: any[]) => void;
} {
  let currentState: number = WS_STATES.OPEN;
  const eventHandlers = new Map<string, Function[]>();
  
  const mock = createWebSocketMock(currentState);
  
  // 重写on方法来记录事件处理器
  mock.on = jest.fn((event: string, handler: Function) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event)!.push(handler);
    return mock;
  });

  const setState = (state: number) => {
    currentState = state;
    mock.readyState = state;
  };

  const triggerEvent = (event: string, ...args: any[]) => {
    const handlers = eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  };

  return { mock, setState, triggerEvent };
}

/**
 * 安装WebSocket模拟
 */
export function mockWebSocket(): void {
  const webSocketMock = createWebSocketMock();
  
  jest.mock('ws', () => {
    return jest.fn().mockImplementation(() => webSocketMock);
  });
}

/**
 * WebSocket Mock 类型导出
 */
export type { MockWebSocket };