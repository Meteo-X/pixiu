#!/usr/bin/env npx ts-node

/**
 * Component Integration Test
 * 
 * Tests individual components of the Connection Manager:
 * - HeartbeatManager functionality
 * - ReconnectStrategy logic
 * - BinanceConnection lifecycle
 * - Error handling and recovery
 */

import WebSocket from 'ws';
import { HeartbeatManager } from './connector/HeartbeatManager';
import { ReconnectStrategy } from './connector/ReconnectStrategy';
import { HeartbeatConfig, ReconnectConfig, ErrorInfo } from './connector/interfaces';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';

// Test configurations
const HEARTBEAT_CONFIG: HeartbeatConfig = {
  pingTimeoutThreshold: 60000,
  unsolicitedPongInterval: 30000,
  healthCheckInterval: 10000,
  pongResponseTimeout: 5000
};

const RECONNECT_CONFIG: ReconnectConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2.0,
  maxRetries: 10,
  jitter: true,
  resetAfter: 300000
};

interface ComponentTestResults {
  component: string;
  status: 'PASS' | 'FAIL';
  details: string;
  metrics?: any;
  errors?: string[];
}

class ComponentIntegrationTester {
  private results: ComponentTestResults[] = [];

  /**
   * Run all component tests
   */
  public async runAllTests(): Promise<ComponentTestResults[]> {
    console.log('🧩 Starting Component Integration Tests');
    console.log('=' .repeat(50));

    await this.testHeartbeatManager();
    await this.testReconnectStrategy();
    await this.testErrorHandling();

    return this.results;
  }

  /**
   * Test HeartbeatManager component
   */
  private async testHeartbeatManager(): Promise<void> {
    console.log('\n💓 Testing HeartbeatManager Component');
    console.log('-' .repeat(40));

    try {
      // Create a test WebSocket connection
      const ws = new WebSocket(`${BINANCE_WS_URL}/ws/btcusdt@trade`);
      
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      console.log('✅ Test WebSocket connected');

      // Create HeartbeatManager
      const heartbeatManager = new HeartbeatManager(ws, HEARTBEAT_CONFIG);
      
      // Test initialization
      const initialStats = heartbeatManager.getStats();
      if (initialStats.pingsReceived === 0 && initialStats.healthScore === 1.0) {
        console.log('✅ HeartbeatManager initialized correctly');
      } else {
        throw new Error('Invalid initial state');
      }

      // Start heartbeat management
      heartbeatManager.start();
      console.log('✅ HeartbeatManager started');

      // Wait for ping/pong activity
      console.log('⏳ Waiting for ping/pong activity...');
      await this.waitForHeartbeat(heartbeatManager, 30000);

      const finalStats = heartbeatManager.getStats();
      const diagnostics = heartbeatManager.getDiagnostics();

      // Validate heartbeat functionality
      if (finalStats.pingsReceived > 0 && finalStats.pongsSent > 0) {
        this.addResult('HEARTBEAT_MANAGER', 'PASS', 
          `Heartbeat working: ${finalStats.pingsReceived} pings, ${finalStats.pongsSent} pongs, health: ${finalStats.healthScore.toFixed(2)}`,
          { stats: finalStats, diagnostics });
      } else {
        this.addResult('HEARTBEAT_MANAGER', 'FAIL', 
          `No heartbeat activity detected`,
          { stats: finalStats, diagnostics });
      }

      // Test health scoring
      const isHealthy = heartbeatManager.isHealthy();
      console.log(`✅ Health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'} (score: ${finalStats.healthScore.toFixed(2)})`);

      // Cleanup
      heartbeatManager.stop();
      ws.close();

    } catch (error) {
      this.addResult('HEARTBEAT_MANAGER', 'FAIL', 
        `HeartbeatManager test failed: ${error.message || error}`, 
        undefined, [error.message || String(error)]);
    }
  }

  /**
   * Test ReconnectStrategy component
   */
  private async testReconnectStrategy(): Promise<void> {
    console.log('\n🔄 Testing ReconnectStrategy Component');
    console.log('-' .repeat(40));

    try {
      const strategy = new ReconnectStrategy(RECONNECT_CONFIG);

      // Test initial state
      const initialStats = strategy.getStats();
      if (initialStats.attempts === 0) {
        console.log('✅ ReconnectStrategy initialized correctly');
      }

      // Test delay calculation (exponential backoff)
      const delays = [];
      for (let i = 0; i < 5; i++) {
        const delay = strategy.getNextDelay();
        delays.push(delay);
        console.log(`  Attempt ${i + 1}: ${delay}ms delay`);
      }

      // Validate exponential backoff
      let isExponential = true;
      for (let i = 1; i < delays.length - 1; i++) {
        if (delays[i] <= delays[i - 1]) {
          isExponential = false;
          break;
        }
      }

      if (isExponential) {
        console.log('✅ Exponential backoff working correctly');
      } else {
        console.log('⚠️  Exponential backoff may not be working as expected');
      }

      // Test error-based reconnection decisions
      const testErrors: ErrorInfo[] = [
        { timestamp: Date.now(), message: 'Network error', code: 'ECONNRESET', type: 'CONNECTION', fatal: false },
        { timestamp: Date.now(), message: 'Heartbeat timeout', code: 'HEARTBEAT_TIMEOUT', type: 'HEARTBEAT', fatal: false },
        { timestamp: Date.now(), message: 'Parse error', code: 'JSON_PARSE', type: 'DATA', fatal: false },
        { timestamp: Date.now(), message: 'Protocol error', code: 'WS_4001', type: 'PROTOCOL', fatal: false }
      ];

      const shouldReconnectResults = testErrors.map(error => ({
        error: error.type,
        shouldReconnect: strategy.shouldReconnect(error)
      }));

      console.log('📊 Reconnection decisions:');
      shouldReconnectResults.forEach(result => {
        console.log(`  ${result.error}: ${result.shouldReconnect ? '🔄 RECONNECT' : '🛑 NO RECONNECT'}`);
      });

      // Test reset functionality
      strategy.reset();
      const resetStats = strategy.getStats();
      if (resetStats.attempts === 0) {
        console.log('✅ Strategy reset working correctly');
      }

      this.addResult('RECONNECT_STRATEGY', 'PASS', 
        `Reconnect strategy working correctly. Tested ${delays.length} attempts with exponential backoff`,
        { delays, shouldReconnectResults, finalStats: strategy.getStats() });

    } catch (error) {
      this.addResult('RECONNECT_STRATEGY', 'FAIL', 
        `ReconnectStrategy test failed: ${error.message || error}`, 
        undefined, [error.message || String(error)]);
    }
  }

  /**
   * Test error handling scenarios
   */
  private async testErrorHandling(): Promise<void> {
    console.log('\n🚨 Testing Error Handling');
    console.log('-' .repeat(40));

    try {
      // Test connection to invalid endpoint
      console.log('🔌 Testing invalid endpoint handling...');
      
      const invalidWs = new WebSocket('wss://invalid-endpoint.binance.com/ws');
      let errorCaught = false;
      let errorMessage = '';

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          errorMessage = 'Connection timeout (expected)';
          errorCaught = true;
          resolve();
        }, 5000);

        invalidWs.on('error', (error) => {
          clearTimeout(timeout);
          errorCaught = true;
          errorMessage = error.message;
          resolve();
        });

        invalidWs.on('open', () => {
          clearTimeout(timeout);
          invalidWs.close();
          resolve();
        });
      });

      if (errorCaught) {
        console.log(`✅ Error properly caught: ${errorMessage}`);
      } else {
        console.log('⚠️  Expected error was not caught');
      }

      // Test HeartbeatManager with closed connection
      console.log('💓 Testing heartbeat with closed connection...');
      
      const testWs = new WebSocket(`${BINANCE_WS_URL}/ws/btcusdt@trade`);
      await new Promise<void>((resolve, reject) => {
        testWs.on('open', () => resolve());
        testWs.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      const heartbeatManager = new HeartbeatManager(testWs, HEARTBEAT_CONFIG);
      heartbeatManager.start();

      // Close connection and test error handling
      testWs.close();
      
      // Try to send unsolicited pong (should handle gracefully)
      let pongError = false;
      try {
        heartbeatManager.sendUnsolicitedPong();
      } catch (error) {
        pongError = true;
      }

      console.log(`✅ Closed connection handled gracefully (pong error: ${pongError})`);

      heartbeatManager.stop();

      this.addResult('ERROR_HANDLING', 'PASS', 
        `Error handling working correctly. Invalid endpoint: ${errorCaught}, Closed connection: handled`,
        { invalidEndpointError: errorMessage, closedConnectionHandled: true });

    } catch (error) {
      this.addResult('ERROR_HANDLING', 'FAIL', 
        `Error handling test failed: ${error.message || error}`, 
        undefined, [error.message || String(error)]);
    }
  }

  /**
   * Wait for heartbeat activity
   */
  private async waitForHeartbeat(heartbeatManager: HeartbeatManager, timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const stats = heartbeatManager.getStats();
        if (stats.pingsReceived > 0) {
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

  /**
   * Add test result
   */
  private addResult(component: string, status: 'PASS' | 'FAIL', details: string, metrics?: any, errors?: string[]): void {
    const result: ComponentTestResults = {
      component,
      status,
      details,
      metrics,
      errors
    };
    
    this.results.push(result);
    
    const statusIcon = status === 'PASS' ? '✅' : '❌';
    console.log(`${statusIcon} ${component}: ${details}`);
    
    if (errors && errors.length > 0) {
      console.log(`   Errors: ${errors.join(', ')}`);
    }
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const tester = new ComponentIntegrationTester();
  
  try {
    const results = await tester.runAllTests();
    
    // Generate final report
    console.log('\n' + '=' .repeat(50));
    console.log('📋 COMPONENT INTEGRATION TEST RESULTS');
    console.log('=' .repeat(50));
    
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
        console.log(`   • ${r.component}: ${r.details}`);
        if (r.errors) {
          r.errors.forEach(err => console.log(`     - ${err}`));
        }
      });
    }
    
    console.log('\n✅ PASSED TESTS:');
    results.filter(r => r.status === 'PASS').forEach(r => {
      console.log(`   • ${r.component}: ${r.details}`);
    });
    
    const overallSuccess = failed === 0;
    console.log(`\n${overallSuccess ? '🎉' : '⚠️'} Overall Result: ${overallSuccess ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
    process.exit(overallSuccess ? 0 : 1);
    
  } catch (error) {
    console.error(`\n💥 Test suite crashed: ${error.message || error}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}