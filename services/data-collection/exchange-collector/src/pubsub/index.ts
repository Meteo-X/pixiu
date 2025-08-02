/**
 * Google Cloud Pub/Sub 模块导出
 * Task 4.1-4.3 完整实现的统一导出
 */

// 核心服务
export { PubSubService, DEFAULT_PUBSUB_SERVICE_CONFIG } from './pubsub-service';
export type { 
  PubSubServiceConfig, 
  PublishOptions, 
  PubSubServiceStats 
} from './pubsub-service';

// 高性能发布者
export { EnhancedPublisher, DEFAULT_PUBLISHER_CONFIG } from './enhanced-publisher';
export type { 
  EnhancedPublisherConfig, 
  PublishResult, 
  BatchPublishResult, 
  PublisherMetrics 
} from './enhanced-publisher';

// Topic 管理
export { TopicManager, DEFAULT_TOPIC_NAMING_CONFIG } from './topic-manager';
export type { 
  TopicNamingConfig, 
  TopicRoutingRule, 
  TopicConfig, 
  RoutingResult,
  TopicStats 
} from './topic-manager';
export { TopicNamingPattern } from './topic-manager';

// 消息序列化
export { MessageSerializer, DEFAULT_SERIALIZATION_CONFIG } from './message-serializer';
export type { 
  SerializationConfig, 
  SerializationResult, 
  MessageHeaders, 
  SerializationStats 
} from './message-serializer';
export { SerializationFormat, CompressionAlgorithm } from './message-serializer';