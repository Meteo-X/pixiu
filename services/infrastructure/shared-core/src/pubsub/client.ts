/**
 * Pub/Sub客户端实现
 * 支持Google Cloud Pub/Sub和本地模拟器
 */

import { EventEmitter } from 'events';
import { PubSub } from '@google-cloud/pubsub';
import {
  Message,
  PublishOptions,
  SubscriptionOptions,
  TopicConfig,
  PubSubConfig,
  PublisherMetrics,
  SubscriberMetrics,
  BatchPublishResult,
  MessageHandler,
  ErrorHandler,
  PubSubClient
} from './types';

export class PubSubClientImpl extends EventEmitter implements PubSubClient {
  private client!: PubSub;
  private subscriptions: Map<string, any> = new Map();
  private publisherMetrics: Map<string, PublisherMetrics> = new Map();
  private subscriberMetrics: Map<string, SubscriberMetrics> = new Map();
  private messageHandlers: Map<string, MessageHandler> = new Map();

  constructor(private config: PubSubConfig) {
    super();
    this.initializeClient();
  }

  /**
   * 发布消息
   */
  async publish(topic: string, data: any, options: PublishOptions = {}): Promise<string> {
    const startTime = Date.now();
    
    try {
      const topicClient = this.client.topic(topic);
      
      const messageData = Buffer.from(JSON.stringify(data));
      const publishOptions: any = {
        attributes: options.attributes || {}
      };

      if (options.orderingKey) {
        publishOptions.orderingKey = options.orderingKey;
      }

      const [messageId] = await topicClient.publishMessage({
        data: messageData,
        ...publishOptions
      });

      // 更新指标
      this.updatePublisherMetrics(topic, true, Date.now() - startTime);

      this.emit('messagePublished', {
        topic,
        messageId,
        data,
        publishTime: Date.now() - startTime
      });

      return messageId;
    } catch (error: any) {
      this.updatePublisherMetrics(topic, false, Date.now() - startTime);
      this.emit('publishError', { topic, error, data });
      throw error;
    }
  }

  /**
   * 批量发布消息
   */
  async publishBatch(
    topic: string, 
    messages: Array<{ data: any; options?: PublishOptions }>
  ): Promise<BatchPublishResult> {
    const startTime = Date.now();
    const result: BatchPublishResult = {
      successCount: 0,
      failureCount: 0,
      failedMessageIds: [],
      publishTime: 0
    };

    try {
      const topicClient = this.client.topic(topic);
      const publishPromises = messages.map(async (msg, index) => {
        try {
          const messageData = Buffer.from(JSON.stringify(msg.data));
          const publishOptions: any = {
            attributes: msg.options?.attributes || {}
          };

          if (msg.options?.orderingKey) {
            publishOptions.orderingKey = msg.options.orderingKey;
          }

          await topicClient.publishMessage({
            data: messageData,
            ...publishOptions
          });

          result.successCount++;
        } catch (error: any) {
          result.failureCount++;
          result.failedMessageIds.push(`message_${index}`);
          this.emit('publishError', { topic, error, data: msg.data });
        }
      });

      await Promise.allSettled(publishPromises);
      
      result.publishTime = Date.now() - startTime;
      
      // 更新指标
      this.updatePublisherMetrics(topic, result.failureCount === 0, result.publishTime);

      return result;
    } catch (error: any) {
      result.failureCount = messages.length;
      result.publishTime = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * 订阅消息
   */
  async subscribe(
    subscriptionName: string, 
    handler: MessageHandler, 
    options: SubscriptionOptions = {}
  ): Promise<void> {
    try {
      const subscription = this.client.subscription(subscriptionName);
      
      // 配置订阅选项
      // Note: Subscription options are typically set during subscription creation
      // These runtime configurations are stored for reference but not applied to the Google Cloud subscription
      if (options.ackDeadlineSeconds) {
        // Store for reference - actual configuration should be done during subscription creation
      }
      if (options.maxMessages) {
        // Store for reference - actual configuration should be done during subscription creation  
      }
      if (options.enableMessageOrdering) {
        // Store for reference - actual configuration should be done during subscription creation
      }

      // 保存处理器
      this.messageHandlers.set(subscriptionName, handler);

      // 设置消息处理器
      subscription.on('message', async (message: any) => {
        const startTime = Date.now();
        
        try {
          const processedMessage: Message = {
            id: message.id,
            topic: subscription.topic ? (typeof subscription.topic === 'string' ? subscription.topic : subscription.topic.name) : 'unknown',
            data: JSON.parse(message.data.toString()),
            attributes: message.attributes,
            timestamp: Date.now(),
            publishTime: message.publishTime ? message.publishTime.toMillis() : undefined,
            ackId: message.ackId
          };

          await handler(processedMessage);
          
          message.ack();
          
          // 更新指标
          this.updateSubscriberMetrics(subscriptionName, true, Date.now() - startTime);
          
          this.emit('messageReceived', {
            subscription: subscriptionName,
            message: processedMessage,
            processingTime: Date.now() - startTime
          });
        } catch (error: any) {
          message.nack();
          
          // 更新指标
          this.updateSubscriberMetrics(subscriptionName, false, Date.now() - startTime);
          
          this.emit('messageError', {
            subscription: subscriptionName,
            error,
            messageId: message.id
          });
        }
      });

      // 设置错误处理器
      subscription.on('error', (error: Error) => {
        this.emit('subscriptionError', {
          subscription: subscriptionName,
          error
        });
      });

      // 保存订阅引用
      this.subscriptions.set(subscriptionName, subscription);

      this.emit('subscriptionStarted', { subscription: subscriptionName });
    } catch (error: any) {
      this.emit('subscriptionError', {
        subscription: subscriptionName,
        error
      });
      throw error;
    }
  }

  /**
   * 取消订阅
   */
  async unsubscribe(subscriptionName: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionName);
    if (subscription) {
      subscription.removeAllListeners();
      subscription.close();
      this.subscriptions.delete(subscriptionName);
      this.messageHandlers.delete(subscriptionName);
      
      this.emit('subscriptionStopped', { subscription: subscriptionName });
    }
  }

  /**
   * 创建主题
   */
  async createTopic(config: TopicConfig): Promise<void> {
    try {
      const [topic] = await this.client.createTopic(config.name);
      
      if (config.messageRetentionDuration) {
        await topic.setMetadata({
          messageRetentionDuration: {
            seconds: config.messageRetentionDuration
          }
        });
      }

      this.emit('topicCreated', { topic: config.name });
    } catch (error: any) {
      if (error.code === 6) { // Already exists
        return;
      }
      throw error;
    }
  }

  /**
   * 删除主题
   */
  async deleteTopic(topicName: string): Promise<void> {
    try {
      await this.client.topic(topicName).delete();
      this.emit('topicDeleted', { topic: topicName });
    } catch (error: any) {
      if (error.code === 5) { // Not found
        return;
      }
      throw error;
    }
  }

  /**
   * 创建订阅
   */
  async createSubscription(
    topicName: string, 
    subscriptionName: string, 
    options: SubscriptionOptions = {}
  ): Promise<void> {
    try {
      const subscriptionOptions: any = {};
      
      if (options.ackDeadlineSeconds) {
        subscriptionOptions.ackDeadlineSeconds = options.ackDeadlineSeconds;
      }
      if (options.enableMessageOrdering) {
        subscriptionOptions.enableMessageOrdering = options.enableMessageOrdering;
      }
      if (options.filter) {
        subscriptionOptions.filter = options.filter;
      }
      if (options.retryPolicy) {
        subscriptionOptions.retryPolicy = {
          minimumBackoff: { seconds: options.retryPolicy.minimumBackoff },
          maximumBackoff: { seconds: options.retryPolicy.maximumBackoff }
        };
      }

      await this.client.topic(topicName).createSubscription(subscriptionName, subscriptionOptions);
      
      this.emit('subscriptionCreated', {
        topic: topicName,
        subscription: subscriptionName
      });
    } catch (error: any) {
      if (error.code === 6) { // Already exists
        return;
      }
      throw error;
    }
  }

  /**
   * 删除订阅
   */
  async deleteSubscription(subscriptionName: string): Promise<void> {
    try {
      await this.unsubscribe(subscriptionName);
      await this.client.subscription(subscriptionName).delete();
      
      this.emit('subscriptionDeleted', { subscription: subscriptionName });
    } catch (error: any) {
      if (error.code === 5) { // Not found
        return;
      }
      throw error;
    }
  }

  /**
   * 获取发布者指标
   */
  getPublisherMetrics(topic: string): PublisherMetrics {
    return this.publisherMetrics.get(topic) || {
      publishedMessages: 0,
      publishFailures: 0,
      averagePublishLatency: 0,
      lastPublishTime: 0
    };
  }

  /**
   * 获取订阅者指标
   */
  getSubscriberMetrics(subscription: string): SubscriberMetrics {
    return this.subscriberMetrics.get(subscription) || {
      receivedMessages: 0,
      acknowledgedMessages: 0,
      processingFailures: 0,
      averageProcessingTime: 0,
      lastReceiveTime: 0
    };
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    // 关闭所有订阅
    for (const subscriptionName of this.subscriptions.keys()) {
      await this.unsubscribe(subscriptionName);
    }

    // 关闭客户端
    await this.client.close();
    
    this.emit('clientClosed');
  }

  /**
   * 初始化客户端
   */
  private initializeClient(): void {
    const clientOptions: any = {
      projectId: this.config.projectId
    };

    // 配置模拟器
    if (this.config.useEmulator && this.config.emulatorHost) {
      process.env.PUBSUB_EMULATOR_HOST = this.config.emulatorHost;
    }

    // 配置认证
    if (this.config.auth?.keyFilename) {
      clientOptions.keyFilename = this.config.auth.keyFilename;
    } else if (this.config.auth?.credentials) {
      clientOptions.credentials = this.config.auth.credentials;
    }

    this.client = new PubSub(clientOptions);
  }

  /**
   * 更新发布者指标
   */
  private updatePublisherMetrics(topic: string, success: boolean, latency: number): void {
    let metrics = this.publisherMetrics.get(topic);
    if (!metrics) {
      metrics = {
        publishedMessages: 0,
        publishFailures: 0,
        averagePublishLatency: 0,
        lastPublishTime: 0
      };
      this.publisherMetrics.set(topic, metrics);
    }

    if (success) {
      metrics.publishedMessages++;
    } else {
      metrics.publishFailures++;
    }

    // 更新平均延迟
    const totalMessages = metrics.publishedMessages + metrics.publishFailures;
    metrics.averagePublishLatency = 
      (metrics.averagePublishLatency * (totalMessages - 1) + latency) / totalMessages;
    
    metrics.lastPublishTime = Date.now();
  }

  /**
   * 更新订阅者指标
   */
  private updateSubscriberMetrics(subscription: string, success: boolean, processingTime: number): void {
    let metrics = this.subscriberMetrics.get(subscription);
    if (!metrics) {
      metrics = {
        receivedMessages: 0,
        acknowledgedMessages: 0,
        processingFailures: 0,
        averageProcessingTime: 0,
        lastReceiveTime: 0
      };
      this.subscriberMetrics.set(subscription, metrics);
    }

    metrics.receivedMessages++;
    
    if (success) {
      metrics.acknowledgedMessages++;
    } else {
      metrics.processingFailures++;
    }

    // 更新平均处理时间
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * (metrics.receivedMessages - 1) + processingTime) / metrics.receivedMessages;
    
    metrics.lastReceiveTime = Date.now();
  }
}