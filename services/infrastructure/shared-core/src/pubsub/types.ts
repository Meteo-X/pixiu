/**
 * Pub/Sub系统核心类型定义
 */

export interface Message {
  id: string;
  topic: string;
  data: any;
  attributes?: Record<string, string>;
  timestamp: number;
  publishTime?: number;
  ackId?: string;
}

export interface PublishOptions {
  /** 消息属性 */
  attributes?: Record<string, string>;
  /** 消息排序键 */
  orderingKey?: string;
  /** 是否启用消息去重 */
  enableDeduplication?: boolean;
  /** 自定义消息ID */
  messageId?: string;
}

export interface SubscriptionOptions {
  /** 确认截止时间（秒） */
  ackDeadlineSeconds?: number;
  /** 最大未确认消息数 */
  maxMessages?: number;
  /** 是否启用消息排序 */
  enableMessageOrdering?: boolean;
  /** 消息过滤器 */
  filter?: string;
  /** 重试策略 */
  retryPolicy?: {
    minimumBackoff: number;
    maximumBackoff: number;
  };
}

export interface TopicConfig {
  /** 主题名称 */
  name: string;
  /** 消息保留期（秒） */
  messageRetentionDuration?: number;
  /** 是否启用消息排序 */
  messageOrdering?: boolean;
  /** 主题标签 */
  labels?: Record<string, string>;
}

export interface PubSubConfig {
  /** 项目ID */
  projectId: string;
  /** 模拟器地址 */
  emulatorHost?: string;
  /** 是否启用模拟器 */
  useEmulator?: boolean;
  /** 默认发布设置 */
  publishSettings?: {
    enableMessageOrdering: boolean;
    batchSettings: {
      maxMessages: number;
      maxBytes: number;
      maxLatency: number;
    };
    retrySettings: {
      maxRetries: number;
      initialRetryDelay: number;
      maxRetryDelay: number;
    };
  };
  /** 认证设置 */
  auth?: {
    keyFilename?: string;
    credentials?: any;
  };
}

export interface PublisherMetrics {
  /** 已发布消息数 */
  publishedMessages: number;
  /** 发布失败数 */
  publishFailures: number;
  /** 平均发布延迟 */
  averagePublishLatency: number;
  /** 最后发布时间 */
  lastPublishTime: number;
}

export interface SubscriberMetrics {
  /** 已接收消息数 */
  receivedMessages: number;
  /** 已确认消息数 */
  acknowledgedMessages: number;
  /** 处理失败数 */
  processingFailures: number;
  /** 平均处理时间 */
  averageProcessingTime: number;
  /** 最后接收时间 */
  lastReceiveTime: number;
}

export interface BatchPublishResult {
  /** 成功发布的消息数 */
  successCount: number;
  /** 失败的消息数 */
  failureCount: number;
  /** 失败的消息ID列表 */
  failedMessageIds: string[];
  /** 发布耗时 */
  publishTime: number;
}

export type MessageHandler = (message: Message) => Promise<void>;

export type ErrorHandler = (error: Error, message?: Message) => void;

export type PublishCallback = (error: Error | null, messageId?: string) => void;

export interface PubSubClient {
  /** 发布消息 */
  publish(topic: string, data: any, options?: PublishOptions): Promise<string>;
  
  /** 批量发布消息 */
  publishBatch(topic: string, messages: Array<{ data: any; options?: PublishOptions }>): Promise<BatchPublishResult>;
  
  /** 订阅消息 */
  subscribe(subscription: string, handler: MessageHandler, options?: SubscriptionOptions): Promise<void>;
  
  /** 取消订阅 */
  unsubscribe(subscription: string): Promise<void>;
  
  /** 创建主题 */
  createTopic(config: TopicConfig): Promise<void>;
  
  /** 删除主题 */
  deleteTopic(topic: string): Promise<void>;
  
  /** 创建订阅 */
  createSubscription(topic: string, subscription: string, options?: SubscriptionOptions): Promise<void>;
  
  /** 删除订阅 */
  deleteSubscription(subscription: string): Promise<void>;
  
  /** 获取发布者指标 */
  getPublisherMetrics(topic: string): PublisherMetrics;
  
  /** 获取订阅者指标 */
  getSubscriberMetrics(subscription: string): SubscriberMetrics;
  
  /** 关闭连接 */
  close(): Promise<void>;
}