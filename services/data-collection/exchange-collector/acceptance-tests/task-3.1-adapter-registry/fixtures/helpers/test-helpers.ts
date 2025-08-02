/**
 * Test helpers and utilities for adapter registry tests
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import axios from 'axios';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

import ExchangeCollectorService from '../../../../src/index';
import { AdapterRegistry } from '../../../../src/adapters/registry/adapter-registry';
import { AdapterIntegration, IntegrationConfig } from '../../../../src/adapters/base/adapter-integration';
import { ExchangeAdapter, AdapterStatus, MarketData, DataType } from '@pixiu/adapter-base';
import { BaseErrorHandler, BaseMonitor, PubSubClientImpl, globalCache } from '@pixiu/shared-core';

/**
 * Mock adapter for testing
 */
export class MockAdapter extends EventEmitter implements ExchangeAdapter {
  private status: AdapterStatus = AdapterStatus.DISCONNECTED;
  private isConnected = false;
  private config: any;
  
  async initialize(config: any): Promise<void> {
    this.config = config;
    this.status = AdapterStatus.DISCONNECTED;
  }

  async connect(): Promise<void> {
    this.status = AdapterStatus.CONNECTING;
    this.emit('statusChange', this.status, AdapterStatus.DISCONNECTED);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.status = AdapterStatus.CONNECTED;
    this.isConnected = true;
    this.emit('statusChange', this.status, AdapterStatus.CONNECTING);
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.status = AdapterStatus.DISCONNECTED;
    this.isConnected = false;
    this.emit('statusChange', this.status, AdapterStatus.CONNECTED);
    this.emit('disconnected', 'manual');
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
  }

  async subscribe(subscription: any): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Adapter not connected');
    }
    
    // Simulate subscription success
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async unsubscribe(subscription: any): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Adapter not connected');
    }
    
    // Simulate unsubscribe success
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  getStatus(): AdapterStatus {
    return this.status;
  }

  getMetrics(): any {
    return {
      connectionsCount: this.isConnected ? 1 : 0,
      subscriptionsCount: 0,
      messagesReceived: 0,
      lastMessageTime: 0,
      uptime: Date.now()
    };
  }

  isHealthy(): boolean {
    return this.isConnected && this.status === AdapterStatus.CONNECTED;
  }

  // Test utility methods
  simulateError(error: Error): void {
    this.emit('error', error);
  }

  simulateData(data: MarketData): void {
    this.emit('data', data);
  }

  simulateDisconnection(reason: string): void {
    this.status = AdapterStatus.DISCONNECTED;
    this.isConnected = false;
    this.emit('disconnected', reason);
  }

  forceStatus(status: AdapterStatus): void {
    const oldStatus = this.status;
    this.status = status;
    this.emit('statusChange', status, oldStatus);
  }
}

/**
 * Mock adapter integration for testing
 */
export class MockAdapterIntegration extends AdapterIntegration {
  private mockAdapter: MockAdapter;

  constructor() {
    super();
    this.mockAdapter = new MockAdapter();
  }

  protected async createAdapter(config: any): Promise<ExchangeAdapter> {
    await this.mockAdapter.initialize(config);
    return this.mockAdapter;
  }

  protected getExchangeName(): string {
    return 'mock';
  }

  protected async startSubscriptions(): Promise<void> {
    const config = this.config.adapterConfig;
    
    if (!config.subscription) {
      throw new Error('No subscription configuration found');
    }

    const { symbols, dataTypes } = config.subscription;
    
    for (const symbol of symbols) {
      for (const dataType of dataTypes) {
        await this.adapter.subscribe({
          symbols: [symbol],
          dataTypes: [dataType]
        });
      }
    }
  }

  // Test utility methods
  getMockAdapter(): MockAdapter {
    return this.mockAdapter;
  }

  simulateError(error: Error): void {
    this.mockAdapter.simulateError(error);
  }

  simulateData(data: MarketData): void {
    this.mockAdapter.simulateData(data);
  }

  simulateDisconnection(reason: string): void {
    this.mockAdapter.simulateDisconnection(reason);
  }
}

/**
 * Mock adapter integration factory
 */
export function createMockAdapterIntegration(): AdapterIntegration {
  return new MockAdapterIntegration();
}

/**
 * Test environment setup and management
 */
export class TestEnvironment {
  private service: ExchangeCollectorService | null = null;
  private configPath: string | null = null;
  private originalEnv: Record<string, string | undefined> = {};
  private cleanupTasks: (() => Promise<void>)[] = [];

  /**
   * Setup test environment with configuration
   */
  async setup(configFile: string): Promise<void> {
    // Backup original environment
    this.originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      PORT: process.env.PORT,
      PUBSUB_EMULATOR_HOST: process.env.PUBSUB_EMULATOR_HOST
    };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';  // Reduce noise in tests
    process.env.PUBSUB_EMULATOR_HOST = 'localhost:8085';

    // Copy config file to test location
    const fixturesDir = path.join(__dirname, '../config-samples');
    const sourceConfig = path.join(fixturesDir, configFile);
    const testConfigDir = path.join(process.cwd(), 'config');
    this.configPath = path.join(testConfigDir, 'test.yaml');

    // Ensure config directory exists
    await fs.mkdir(testConfigDir, { recursive: true });
    
    // Copy configuration
    const configContent = await fs.readFile(sourceConfig, 'utf8');
    await fs.writeFile(this.configPath, configContent);

    this.cleanupTasks.push(async () => {
      if (this.configPath) {
        await fs.unlink(this.configPath).catch(() => {});
      }
    });
  }

  /**
   * Start the service
   */
  async startService(): Promise<ExchangeCollectorService> {
    if (this.service) {
      throw new Error('Service already started');
    }

    this.service = new ExchangeCollectorService();
    await this.service.initialize();
    await this.service.start();

    this.cleanupTasks.push(async () => {
      if (this.service) {
        await this.service.stop();
      }
    });

    return this.service;
  }

  /**
   * Stop the service
   */
  async stopService(): Promise<void> {
    if (this.service) {
      await this.service.stop();
      this.service = null;
    }
  }

  /**
   * Clean up test environment
   */
  async cleanup(): Promise<void> {
    // Run cleanup tasks in reverse order
    for (const cleanup of this.cleanupTasks.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        console.warn('Cleanup task failed:', error);
      }
    }

    // Restore original environment
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Clean up global cache
    globalCache.destroy();

    this.cleanupTasks = [];
    this.service = null;
    this.configPath = null;
  }

  /**
   * Get service instance
   */
  getService(): ExchangeCollectorService | null {
    return this.service;
  }
}

/**
 * HTTP client for API testing
 */
export class ApiClient {
  private baseUrl: string;
  private client: typeof axios;

  constructor(baseUrl: string = 'http://127.0.0.1:18080') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 5000,
      validateStatus: () => true  // Don't throw on HTTP errors
    });
  }

  /**
   * Health check endpoints
   */
  async getHealth(): Promise<any> {
    const response = await this.client.get('/health');
    return { status: response.status, data: response.data };
  }

  async getHealthReady(): Promise<any> {
    const response = await this.client.get('/health/ready');
    return { status: response.status, data: response.data };
  }

  async getHealthLive(): Promise<any> {
    const response = await this.client.get('/health/live');
    return { status: response.status, data: response.data };
  }

  /**
   * Metrics endpoints
   */
  async getMetrics(): Promise<any> {
    const response = await this.client.get('/metrics');
    return { status: response.status, data: response.data };
  }

  async getMetricsJson(): Promise<any> {
    const response = await this.client.get('/metrics/json');
    return { status: response.status, data: response.data };
  }

  /**
   * Adapter management endpoints
   */
  async getAdapters(): Promise<any> {
    const response = await this.client.get('/api/adapters');
    return { status: response.status, data: response.data };
  }

  async getAdapter(name: string): Promise<any> {
    const response = await this.client.get(`/api/adapters/${name}`);
    return { status: response.status, data: response.data };
  }

  async startAdapter(name: string, config: IntegrationConfig): Promise<any> {
    const response = await this.client.post(`/api/adapters/${name}/start`, config);
    return { status: response.status, data: response.data };
  }

  async stopAdapter(name: string): Promise<any> {
    const response = await this.client.post(`/api/adapters/${name}/stop`);
    return { status: response.status, data: response.data };
  }

  async restartAdapter(name: string): Promise<any> {
    const response = await this.client.post(`/api/adapters/${name}/restart`);
    return { status: response.status, data: response.data };
  }

  async setAdapterEnabled(name: string, enabled: boolean): Promise<any> {
    const response = await this.client.patch(`/api/adapters/${name}/enabled`, { enabled });
    return { status: response.status, data: response.data };
  }
}

/**
 * Performance measurement utilities
 */
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Measure execution time of an async function
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordMeasurement(name, Date.now() - start);
      return result;
    } catch (error) {
      this.recordMeasurement(name, Date.now() - start);
      throw error;
    }
  }

  /**
   * Record a measurement manually
   */
  recordMeasurement(name: string, duration: number): void {
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);
  }

  /**
   * Get statistics for a measurement
   */
  getStats(name: string): { count: number; min: number; max: number; avg: number; p95: number } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const count = measurements.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = measurements.reduce((sum, val) => sum + val, 0) / count;
    const p95Index = Math.floor(count * 0.95);
    const p95 = sorted[p95Index];

    return { count, min, max, avg, p95 };
  }

  /**
   * Get all measurements
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const name of this.measurements.keys()) {
      stats[name] = this.getStats(name);
    }
    return stats;
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements.clear();
  }
}

/**
 * Utility functions
 */
export const testUtils = {
  /**
   * Wait for a condition to be met
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  /**
   * Wait for a specific amount of time
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Generate random test data
   */
  generateRandomMarketData(exchange: string = 'test', symbol: string = 'TESTUSDT'): MarketData {
    return {
      exchange,
      symbol,
      type: DataType.TRADE,
      timestamp: Date.now(),
      data: {
        price: (Math.random() * 50000 + 10000).toFixed(2),
        quantity: (Math.random() * 10).toFixed(6),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        tradeId: Math.random().toString(36).substr(2, 9),
        eventTime: Date.now()
      },
      receivedAt: Date.now()
    };
  },

  /**
   * Check if a port is available
   */
  async isPortAvailable(port: number): Promise<boolean> {
    try {
      const result = execSync(`netstat -tuln | grep :${port}`, { encoding: 'utf8' });
      return result.length === 0;
    } catch (error) {
      return true; // Assume available if netstat fails
    }
  },

  /**
   * Validate JSON schema
   */
  validateSchema(data: any, expectedFields: string[]): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    for (const field of expectedFields) {
      if (!(field in data)) {
        missing.push(field);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing
    };
  },

  /**
   * Deep clone object
   */
  deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
};

/**
 * Test assertions and validators
 */
export const testAssertions = {
  /**
   * Assert that a response has expected structure
   */
  assertHealthResponse(response: any): void {
    expect(response).toHaveProperty('status');
    expect(response).toHaveProperty('timestamp');
    expect(response).toHaveProperty('service', 'exchange-collector');
    expect(response).toHaveProperty('uptime');
    expect(response).toHaveProperty('checks');
    expect(typeof response.uptime).toBe('number');
    expect(response.uptime).toBeGreaterThan(0);
  },

  /**
   * Assert that an adapter response has expected structure
   */
  assertAdapterResponse(response: any): void {
    expect(response).toHaveProperty('name');
    expect(response).toHaveProperty('version');
    expect(response).toHaveProperty('description');
    expect(response).toHaveProperty('enabled');
    expect(response).toHaveProperty('running');
    expect(response).toHaveProperty('status');
    expect(response).toHaveProperty('healthy');
    expect(typeof response.enabled).toBe('boolean');
    expect(typeof response.running).toBe('boolean');
    expect(typeof response.healthy).toBe('boolean');
  },

  /**
   * Assert that metrics response has expected structure
   */
  assertMetricsResponse(response: any): void {
    expect(response).toHaveProperty('timestamp');
    expect(response).toHaveProperty('uptime');
    expect(response).toHaveProperty('system');
    expect(response.system).toHaveProperty('memory');
    expect(response.system).toHaveProperty('cpu');
    expect(typeof response.uptime).toBe('number');
  }
};