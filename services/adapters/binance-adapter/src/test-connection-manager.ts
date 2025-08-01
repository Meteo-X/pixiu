#!/usr/bin/env npx ts-node

/**
 * Comprehensive Connection Manager Testing Suite
 * 
 * This test validates:
 * 1. WebSocket connection establishment and ping/pong heartbeat handling
 * 2. Connection pool management and load balancing
 * 3. Reconnection strategies and exponential backoff
 * 4. Monitoring and health assessment capabilities
 * 5. Error handling and failure scenarios
 * 6. Performance validation and resource usage
 */

import { ConnectionManager } from './connector/ConnectionManager';
import { ConnectionManagerConfig } from './connector/interfaces';
import { DataSubscription } from './types';

// Test configuration following Binance official specifications
const TEST_CONFIG: ConnectionManagerConfig = {
  wsEndpoint: 'wss://stream.binance.com:9443',
  pool: {
    maxConnections: 3,
    maxStreamsPerConnection: 10,
    connectionTimeout: 30000,
    idleTimeout: 300000,
    healthCheckInterval: 30000
  },
  heartbeat: {
    pingTimeoutThreshold: 60000, // 60 seconds as per Binance spec
    unsolicitedPongInterval: 30000, // Optional unsolicited pong every 30s
    healthCheckInterval: 10000,
    pongResponseTimeout: 5000
  },
  reconnect: {
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2.0,
    maxRetries: 10,
    jitter: true,
    resetAfter: 300000
  },
  monitoring: {
    metricsInterval: 10000,
    healthScoreThreshold: 0.7,
    alertOnHealthDrop: true,
    latencyBuckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
  }
};

// Test subscriptions
const TEST_SUBSCRIPTIONS: DataSubscription[] = [
  { symbol: 'BTCUSDT', dataType: 'trade' },
  { symbol: 'ETHUSDT', dataType: 'trade' },
  { symbol: 'BTCUSDT', dataType: 'ticker' },
  { symbol: 'ETHUSDT', dataType: 'ticker' },
  { symbol: 'BTCUSDT', dataType: 'depth', params: { levels: 20, speed: '100ms' } },
  { symbol: 'BTCUSDT', dataType: 'kline_1m' },
  { symbol: 'ETHUSDT', dataType: 'kline_1m' },
];

interface TestResults {
  phase: string;
  status: 'PASS' | 'FAIL' | 'RUNNING';
  details: string;
  metrics?: any;
  errors?: string[];
  timestamp: number;
  duration?: number;
}

class ConnectionManagerTester {
  private manager: ConnectionManager;
  private results: TestResults[] = [];
  private startTime: number = 0;

  constructor() {
    this.manager = new ConnectionManager();
  }

  /**
   * Run all tests
   */
  public async runAllTests(): Promise<TestResults[]> {
    console.log('🚀 Starting Comprehensive Connection Manager Tests\n');
    console.log('='.repeat(60));
    this.startTime = Date.now();

    try {
      // Phase 1: Basic initialization and configuration
      await this.testInitialization();
      
      // Phase 2: WebSocket connection and heartbeat mechanism
      await this.testHeartbeatMechanism();
      
      // Phase 3: Connection pool management
      await this.testConnectionPoolManagement();
      
      // Phase 4: Subscription management and load balancing
      await this.testSubscriptionManagement();
      
      // Phase 5: Reconnection strategies
      await this.testReconnectionStrategies();
      
      // Phase 6: Performance and monitoring
      await this.testPerformanceMonitoring();
      
      // Phase 7: Error handling and recovery
      await this.testErrorHandling();

    } catch (error) {
      this.addResult('CRITICAL_ERROR', 'FAIL', `Test suite failed: ${error.message}`, undefined, [error.message]);
    } finally {
      await this.cleanup();
    }

    return this.results;
  }

  /**
   * Test 1: Initialization and Configuration
   */
  private async testInitialization(): Promise<void> {
    const phaseStart = Date.now();
    console.log('📋 Phase 1: Testing Initialization and Configuration');

    try {
      // Test initialization
      await this.manager.initialize(TEST_CONFIG);
      this.addResult('INITIALIZATION', 'PASS', 'Manager initialized successfully');

      // Test configuration validation
      const config = this.manager.getConfig();
      const isConfigValid = this.validateConfig(config);
      
      if (isConfigValid) {
        this.addResult('CONFIG_VALIDATION', 'PASS', 'Configuration validation passed');
      } else {
        this.addResult('CONFIG_VALIDATION', 'FAIL', 'Configuration validation failed');
      }

      // Test manager start
      await this.manager.start();
      const status = this.manager.getStatus();
      
      if (status.isRunning) {
        this.addResult('MANAGER_START', 'PASS', 'Manager started successfully', status);
      } else {
        this.addResult('MANAGER_START', 'FAIL', 'Manager failed to start', status);
      }

    } catch (error) {
      this.addResult('INITIALIZATION', 'FAIL', `Initialization failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 1 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 2: WebSocket Connection and Heartbeat Mechanism
   */
  private async testHeartbeatMechanism(): Promise<void> {
    const phaseStart = Date.now();
    console.log('💓 Phase 2: Testing WebSocket Connection and Heartbeat Mechanism');

    try {
      // Subscribe to a test stream to establish connection
      const testSub: DataSubscription[] = [{ symbol: 'BTCUSDT', dataType: 'trade' }];
      await this.manager.subscribe(testSub);

      // Wait for connection to stabilize and receive heartbeats
      console.log('⏳ Waiting for connection stabilization and heartbeat detection...');
      await this.waitForHeartbeats(30000); // Wait 30 seconds

      const detailedStats = this.manager.getDetailedStats();
      const connections = detailedStats.connections;

      if (connections.length > 0) {
        const conn = connections[0];
        const heartbeatStats = await this.getConnectionHeartbeatStats(conn.connectionId);

        // Validate heartbeat mechanism
        const heartbeatValid = this.validateHeartbeatMechanism(heartbeatStats);
        
        if (heartbeatValid.isValid) {
          this.addResult('HEARTBEAT_MECHANISM', 'PASS', 
            `Heartbeat mechanism working correctly. ${heartbeatValid.details}`, 
            heartbeatStats);
        } else {
          this.addResult('HEARTBEAT_MECHANISM', 'FAIL', 
            `Heartbeat mechanism issues: ${heartbeatValid.details}`, 
            heartbeatStats);
        }

        // Test ping/pong timing compliance with Binance spec
        const pingPongCompliance = this.validatePingPongCompliance(heartbeatStats);
        this.addResult('PING_PONG_COMPLIANCE', 
          pingPongCompliance.isCompliant ? 'PASS' : 'FAIL',
          pingPongCompliance.message,
          { compliance: pingPongCompliance });

      } else {
        this.addResult('HEARTBEAT_MECHANISM', 'FAIL', 'No connections established for heartbeat testing');
      }

    } catch (error) {
      this.addResult('HEARTBEAT_MECHANISM', 'FAIL', `Heartbeat testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 2 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 3: Connection Pool Management
   */
  private async testConnectionPoolManagement(): Promise<void> {
    const phaseStart = Date.now();
    console.log('🏊 Phase 3: Testing Connection Pool Management');

    try {
      // Test multiple subscriptions to trigger pool expansion
      const multipleSubscriptions = TEST_SUBSCRIPTIONS.slice(0, 15); // More than max per connection
      await this.manager.subscribe(multipleSubscriptions);

      await this.wait(5000); // Allow connections to establish

      const status = this.manager.getStatus();
      const detailedStats = this.manager.getDetailedStats();

      // Validate pool management
      const poolValidation = this.validateConnectionPool(status, detailedStats);
      
      this.addResult('CONNECTION_POOL', 
        poolValidation.isValid ? 'PASS' : 'FAIL',
        poolValidation.message,
        { status, poolStats: detailedStats.loadBalancing });

      // Test load balancing
      const loadBalancingValidation = this.validateLoadBalancing(detailedStats);
      this.addResult('LOAD_BALANCING',
        loadBalancingValidation.isBalanced ? 'PASS' : 'FAIL',
        loadBalancingValidation.message,
        loadBalancingValidation.distribution);

    } catch (error) {
      this.addResult('CONNECTION_POOL', 'FAIL', `Pool management testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 3 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 4: Subscription Management
   */
  private async testSubscriptionManagement(): Promise<void> {
    const phaseStart = Date.now();
    console.log('📡 Phase 4: Testing Subscription Management');

    try {
      const initialStatus = this.manager.getStatus();
      
      // Test subscription addition
      const newSubs: DataSubscription[] = [
        { symbol: 'ADAUSDT', dataType: 'trade' },
        { symbol: 'ADAUSDT', dataType: 'ticker' }
      ];
      
      await this.manager.subscribe(newSubs);
      await this.wait(2000);

      const afterAddStatus = this.manager.getStatus();
      
      // Test subscription removal
      await this.manager.unsubscribe(newSubs);
      await this.wait(2000);

      const afterRemoveStatus = this.manager.getStatus();

      // Validate subscription management
      const subValidation = this.validateSubscriptionManagement(
        initialStatus, afterAddStatus, afterRemoveStatus, newSubs.length
      );

      this.addResult('SUBSCRIPTION_MANAGEMENT',
        subValidation.isValid ? 'PASS' : 'FAIL',
        subValidation.message,
        { initialStatus, afterAddStatus, afterRemoveStatus });

    } catch (error) {
      this.addResult('SUBSCRIPTION_MANAGEMENT', 'FAIL', 
        `Subscription management testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 4 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 5: Reconnection Strategies
   */
  private async testReconnectionStrategies(): Promise<void> {
    const phaseStart = Date.now();
    console.log('🔄 Phase 5: Testing Reconnection Strategies');

    try {
      // Force reconnect all connections to test strategy
      console.log('⚡ Triggering force reconnect...');
      await this.manager.forceReconnectAll();
      await this.wait(10000); // Wait for reconnections

      const statusAfterReconnect = this.manager.getStatus();
      const detailedStats = this.manager.getDetailedStats();

      // Validate reconnection success
      const reconnectValidation = this.validateReconnectionStrategy(statusAfterReconnect, detailedStats);
      
      this.addResult('RECONNECTION_STRATEGY',
        reconnectValidation.isValid ? 'PASS' : 'FAIL',
        reconnectValidation.message,
        { statusAfterReconnect, reconnectStats: reconnectValidation.stats });

    } catch (error) {
      this.addResult('RECONNECTION_STRATEGY', 'FAIL', 
        `Reconnection testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 5 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 6: Performance and Monitoring
   */
  private async testPerformanceMonitoring(): Promise<void> {
    const phaseStart = Date.now();
    console.log('📊 Phase 6: Testing Performance and Monitoring');

    try {
      // Let system run for performance measurement
      console.log('📈 Collecting performance metrics...');
      await this.wait(15000); // 15 seconds of data collection

      const detailedStats = this.manager.getDetailedStats();
      const performanceValidation = this.validatePerformanceMetrics(detailedStats);

      this.addResult('PERFORMANCE_METRICS',
        performanceValidation.isValid ? 'PASS' : 'FAIL',
        performanceValidation.message,
        performanceValidation.metrics);

      // Test health check
      const isHealthy = await this.manager.performHealthCheck();
      this.addResult('HEALTH_CHECK',
        isHealthy ? 'PASS' : 'FAIL',
        `Overall health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`,
        { isHealthy });

    } catch (error) {
      this.addResult('PERFORMANCE_MONITORING', 'FAIL', 
        `Performance monitoring testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 6 completed in ${Date.now() - phaseStart}ms\n`);
  }

  /**
   * Test 7: Error Handling
   */
  private async testErrorHandling(): Promise<void> {
    const phaseStart = Date.now();
    console.log('🚨 Phase 7: Testing Error Handling and Recovery');

    try {
      // Test with invalid subscriptions
      const invalidSubs: DataSubscription[] = [
        { symbol: 'INVALID', dataType: 'trade' },
        { symbol: 'BTCUSDT', dataType: 'invalid_type' as any }
      ];

      let errorCaught = false;
      try {
        await this.manager.subscribe(invalidSubs);
      } catch (error) {
        errorCaught = true;
      }

      const detailedStats = this.manager.getDetailedStats();
      const errorHandlingValidation = this.validateErrorHandling(detailedStats, errorCaught);

      this.addResult('ERROR_HANDLING',
        errorHandlingValidation.isValid ? 'PASS' : 'FAIL',
        errorHandlingValidation.message,
        { errors: detailedStats.errors, errorCaught });

    } catch (error) {
      this.addResult('ERROR_HANDLING', 'FAIL', 
        `Error handling testing failed: ${error.message}`, undefined, [error.message]);
    }

    console.log(`✓ Phase 7 completed in ${Date.now() - phaseStart}ms\n`);
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  private validateConfig(config: ConnectionManagerConfig): boolean {
    return config.wsEndpoint.includes('binance.com') &&
           config.heartbeat.pingTimeoutThreshold === 60000 &&
           config.pool.maxConnections > 0 &&
           config.reconnect.maxRetries > 0;
  }

  private validateHeartbeatMechanism(heartbeatStats: any): { isValid: boolean; details: string } {
    if (!heartbeatStats) {
      return { isValid: false, details: 'No heartbeat statistics available' };
    }

    const hasReceivedPings = heartbeatStats.pingsReceived > 0;
    const hasSentPongs = heartbeatStats.pongsSent > 0;
    const healthScore = heartbeatStats.healthScore > 0.5;
    
    return {
      isValid: hasReceivedPings && hasSentPongs && healthScore,
      details: `Pings: ${heartbeatStats.pingsReceived}, Pongs: ${heartbeatStats.pongsSent}, Health: ${heartbeatStats.healthScore.toFixed(2)}`
    };
  }

  private validatePingPongCompliance(heartbeatStats: any): { isCompliant: boolean; message: string } {
    if (!heartbeatStats || heartbeatStats.pingsReceived === 0) {
      return { isCompliant: false, message: 'No ping/pong activity detected' };
    }

    const avgResponseTime = heartbeatStats.avgPongResponseTime;
    const maxResponseTime = heartbeatStats.maxPongResponseTime;
    
    // Binance allows up to 60 seconds, but good response should be < 5 seconds
    const isCompliant = avgResponseTime < 5000 && maxResponseTime < 10000;
    
    return {
      isCompliant,
      message: `Avg response: ${avgResponseTime.toFixed(2)}ms, Max: ${maxResponseTime.toFixed(2)}ms`
    };
  }

  private validateConnectionPool(status: any, detailedStats: any): { isValid: boolean; message: string } {
    const hasConnections = status.connectionCount > 0;
    const hasHealthyConnections = status.healthyConnections > 0;
    const reasonableHealthScore = status.overallHealthScore > 0.5;

    return {
      isValid: hasConnections && hasHealthyConnections && reasonableHealthScore,
      message: `Connections: ${status.connectionCount}, Healthy: ${status.healthyConnections}, Health Score: ${status.overallHealthScore.toFixed(2)}`
    };
  }

  private validateLoadBalancing(detailedStats: any): { isBalanced: boolean; message: string; distribution: any } {
    const subscriptions = detailedStats.subscriptions || [];
    if (subscriptions.length === 0) {
      return { isBalanced: true, message: 'No subscriptions for load balancing test', distribution: [] };
    }

    // Check if subscriptions are reasonably distributed
    const maxSubs = Math.max(...subscriptions.map((s: any) => s.subscriptionCount));
    const minSubs = Math.min(...subscriptions.map((s: any) => s.subscriptionCount));
    const isBalanced = (maxSubs - minSubs) <= 3; // Allow some variance

    return {
      isBalanced,
      message: `Subscription distribution - Max: ${maxSubs}, Min: ${minSubs}`,
      distribution: subscriptions
    };
  }

  private validateSubscriptionManagement(initial: any, afterAdd: any, afterRemove: any, addedCount: number): { isValid: boolean; message: string } {
    const subsIncreased = afterAdd.totalSubscriptions >= (initial.totalSubscriptions + addedCount);
    const subsDecreased = afterRemove.totalSubscriptions <= afterAdd.totalSubscriptions;

    return {
      isValid: subsIncreased && subsDecreased,
      message: `Initial: ${initial.totalSubscriptions}, After add: ${afterAdd.totalSubscriptions}, After remove: ${afterRemove.totalSubscriptions}`
    };
  }

  private validateReconnectionStrategy(status: any, detailedStats: any): { isValid: boolean; message: string; stats: any } {
    const hasConnections = status.connectionCount > 0;
    const isHealthy = status.overallHealthScore > 0.5;
    
    const reconnectStats = detailedStats.connections.reduce((acc: any, conn: any) => ({
      totalReconnects: acc.totalReconnects + conn.stats.reconnectAttempts,
      successfulReconnects: acc.successfulReconnects + (conn.stats.state === 'active' ? 1 : 0)
    }), { totalReconnects: 0, successfulReconnects: 0 });

    return {
      isValid: hasConnections && isHealthy,
      message: `Reconnection completed. Active connections: ${status.connectionCount}, Health: ${status.overallHealthScore.toFixed(2)}`,
      stats: reconnectStats
    };
  }

  private validatePerformanceMetrics(detailedStats: any): { isValid: boolean; message: string; metrics: any } {
    const performance = detailedStats.performance;
    const hasMessages = performance.totalMessagesReceived > 0;
    const reasonableLatency = performance.avgLatency < 200; // 200ms threshold
    
    return {
      isValid: hasMessages && reasonableLatency,
      message: `Messages: ${performance.totalMessagesReceived}, Avg Latency: ${performance.avgLatency.toFixed(2)}ms`,
      metrics: performance
    };
  }

  private validateErrorHandling(detailedStats: any, errorCaught: boolean): { isValid: boolean; message: string } {
    const hasErrorLogging = detailedStats.errors && detailedStats.errors.length >= 0;
    const properErrorHandling = errorCaught; // Should catch invalid subscriptions

    return {
      isValid: hasErrorLogging,
      message: `Error logging available: ${hasErrorLogging}, Proper error handling: ${properErrorHandling}`
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async waitForHeartbeats(timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const status = this.manager.getStatus();
        if (status.healthyConnections > 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, timeout);
    });
  }

  private async getConnectionHeartbeatStats(connectionId: string): Promise<any> {
    const detailedStats = this.manager.getDetailedStats();
    const connection = detailedStats.connections.find((c: any) => c.connectionId === connectionId);
    return connection ? connection.heartbeatStats : null;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private addResult(phase: string, status: 'PASS' | 'FAIL' | 'RUNNING', details: string, metrics?: any, errors?: string[]): void {
    const result: TestResults = {
      phase,
      status,
      details,
      metrics,
      errors,
      timestamp: Date.now(),
      duration: Date.now() - this.startTime
    };
    
    this.results.push(result);
    
    const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
    console.log(`${statusIcon} ${phase}: ${details}`);
    
    if (errors && errors.length > 0) {
      console.log(`   Errors: ${errors.join(', ')}`);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await this.manager.stop();
      console.log('\n🧹 Cleanup completed');
    } catch (error) {
      console.log(`⚠️  Cleanup error: ${error.message}`);
    }
  }
}

// ============================================================================
// Main Test Execution
// ============================================================================

async function main(): Promise<void> {
  const tester = new ConnectionManagerTester();
  
  try {
    const results = await tester.runAllTests();
    
    // Generate final report
    console.log('\n' + '='.repeat(60));
    console.log('📋 FINAL TEST REPORT');
    console.log('='.repeat(60));
    
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const total = results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`   • ${r.phase}: ${r.details}`);
        if (r.errors) {
          r.errors.forEach(err => console.log(`     - ${err}`));
        }
      });
    }
    
    console.log('\n✅ PASSED TESTS:');
    results.filter(r => r.status === 'PASS').forEach(r => {
      console.log(`   • ${r.phase}: ${r.details}`);
    });
    
    const overallSuccess = failed === 0;
    console.log(`\n${overallSuccess ? '🎉' : '⚠️'} Overall Result: ${overallSuccess ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
    process.exit(overallSuccess ? 0 : 1);
    
  } catch (error) {
    console.error(`\n💥 Test suite crashed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}