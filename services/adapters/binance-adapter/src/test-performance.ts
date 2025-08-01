#!/usr/bin/env npx ts-node

/**
 * Performance and Resource Usage Test
 * 
 * Tests the performance characteristics and resource usage of the Connection Manager:
 * - Message throughput and latency
 * - Memory usage patterns
 * - CPU utilization during high load
 * - Connection scalability
 * - Resource cleanup efficiency
 */

import WebSocket from 'ws';
import { HeartbeatManager } from './connector/HeartbeatManager';
import { ReconnectStrategy } from './connector/ReconnectStrategy';
import { HeartbeatConfig, ReconnectConfig } from './connector/interfaces';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';

// Performance test configuration
const PERFORMANCE_CONFIG = {
  testDurationMs: 60000, // 1 minute test
  maxConnections: 5,
  streamsPerConnection: ['btcusdt@trade', 'ethusdt@trade', 'adausdt@trade'],
  memoryCheckInterval: 5000,
  latencyMeasurements: 1000
};

interface PerformanceMetrics {
  duration: number;
  connectionsCreated: number;
  messagesReceived: number;
  avgThroughput: number; // messages per second
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  memoryUsage: {
    initial: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
    final: NodeJS.MemoryUsage;
  };
  heartbeatStats: {
    totalPings: number;
    totalPongs: number;
    avgPongResponseTime: number;
    healthScore: number;
  };
  resourceCleanupScore: number;
  errors: string[];
}

class PerformanceTester {
  private metrics: PerformanceMetrics;
  private startTime: number = 0;
  private connections: WebSocket[] = [];
  private heartbeatManagers: HeartbeatManager[] = [];
  private latencies: number[] = [];
  private memorySnapshots: NodeJS.MemoryUsage[] = [];

  constructor() {
    this.metrics = {
      duration: 0,
      connectionsCreated: 0,
      messagesReceived: 0,
      avgThroughput: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      minLatency: Number.MAX_VALUE,
      maxLatency: 0,
      memoryUsage: {
        initial: process.memoryUsage(),
        peak: process.memoryUsage(),
        final: process.memoryUsage()
      },
      heartbeatStats: {
        totalPings: 0,
        totalPongs: 0,
        avgPongResponseTime: 0,
        healthScore: 0
      },
      resourceCleanupScore: 0,
      errors: []
    };
  }

  /**
   * Run comprehensive performance test
   */
  public async runPerformanceTest(): Promise<PerformanceMetrics> {
    console.log('🚀 Starting Performance and Resource Usage Test');
    console.log('=' .repeat(60));
    console.log(`Test Duration: ${PERFORMANCE_CONFIG.testDurationMs / 1000} seconds`);
    console.log(`Max Connections: ${PERFORMANCE_CONFIG.maxConnections}`);
    console.log(`Streams per Connection: ${PERFORMANCE_CONFIG.streamsPerConnection.length}`);
    console.log('');

    this.startTime = Date.now();
    this.metrics.memoryUsage.initial = process.memoryUsage();

    // Start memory monitoring
    const memoryTimer = setInterval(() => {
      this.trackMemoryUsage();
    }, PERFORMANCE_CONFIG.memoryCheckInterval);

    try {
      // Phase 1: Create multiple connections
      await this.testConnectionScalability();

      // Phase 2: Measure message throughput and latency
      await this.testMessageThroughput();

      // Phase 3: Test heartbeat performance under load
      await this.testHeartbeatPerformance();

      // Phase 4: Test resource cleanup
      await this.testResourceCleanup();

    } catch (error) {
      this.metrics.errors.push(`Performance test error: ${error.message || error}`);
    } finally {
      clearInterval(memoryTimer);
      await this.cleanup();
    }

    this.calculateFinalMetrics();
    return this.metrics;
  }

  /**
   * Test connection scalability
   */
  private async testConnectionScalability(): Promise<void> {
    console.log('🔗 Phase 1: Testing Connection Scalability');
    console.log('-' .repeat(40));

    const heartbeatConfig: HeartbeatConfig = {
      pingTimeoutThreshold: 60000,
      unsolicitedPongInterval: 30000,
      healthCheckInterval: 10000,
      pongResponseTimeout: 5000
    };

    for (let i = 0; i < PERFORMANCE_CONFIG.maxConnections; i++) {
      try {
        const streamList = PERFORMANCE_CONFIG.streamsPerConnection.join('/');
        const wsUrl = `${BINANCE_WS_URL}/stream?streams=${streamList}`;
        
        console.log(`  Creating connection ${i + 1}/${PERFORMANCE_CONFIG.maxConnections}...`);
        const ws = new WebSocket(wsUrl);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Connection ${i + 1} timeout`));
          }, 10000);

          ws.on('open', () => {
            clearTimeout(timeout);
            console.log(`  ✅ Connection ${i + 1} established`);
            resolve();
          });

          ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        // Set up message handling for throughput measurement
        ws.on('message', (data) => {
          this.handleMessage(data);
        });

        ws.on('error', (error) => {
          this.metrics.errors.push(`Connection ${i + 1} error: ${error.message}`);
        });

        // Create heartbeat manager for this connection
        const heartbeatManager = new HeartbeatManager(ws, heartbeatConfig);
        heartbeatManager.start();

        this.connections.push(ws);
        this.heartbeatManagers.push(heartbeatManager);
        this.metrics.connectionsCreated++;

        // Small delay between connections to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        this.metrics.errors.push(`Failed to create connection ${i + 1}: ${error.message || error}`);
        console.log(`  ❌ Connection ${i + 1} failed: ${error.message || error}`);
      }
    }

    console.log(`✅ Created ${this.metrics.connectionsCreated} connections successfully`);
  }

  /**
   * Test message throughput and latency
   */
  private async testMessageThroughput(): Promise<void> {
    console.log('\n📊 Phase 2: Testing Message Throughput and Latency');
    console.log('-' .repeat(40));

    const measurementStart = Date.now();
    const measurementDuration = 30000; // 30 seconds

    console.log(`📈 Measuring throughput for ${measurementDuration / 1000} seconds...`);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, measurementDuration);
    });

    const measurementEnd = Date.now();
    const actualDuration = (measurementEnd - measurementStart) / 1000;
    this.metrics.avgThroughput = this.metrics.messagesReceived / actualDuration;

    console.log(`✅ Throughput measurement completed:`);
    console.log(`  Messages received: ${this.metrics.messagesReceived}`);
    console.log(`  Average throughput: ${this.metrics.avgThroughput.toFixed(2)} msg/sec`);
    console.log(`  Total connections: ${this.connections.length}`);
    console.log(`  Per-connection throughput: ${(this.metrics.avgThroughput / this.connections.length).toFixed(2)} msg/sec`);
  }

  /**
   * Test heartbeat performance under load
   */
  private async testHeartbeatPerformance(): Promise<void> {
    console.log('\n💓 Phase 3: Testing Heartbeat Performance Under Load');
    console.log('-' .repeat(40));

    // Collect heartbeat statistics
    let totalPings = 0;
    let totalPongs = 0;
    let totalResponseTime = 0;
    let totalHealthScore = 0;

    for (const manager of this.heartbeatManagers) {
      const stats = manager.getStats();
      totalPings += stats.pingsReceived;
      totalPongs += stats.pongsSent;
      totalResponseTime += stats.avgPongResponseTime;
      totalHealthScore += stats.healthScore;
    }

    this.metrics.heartbeatStats = {
      totalPings,
      totalPongs,
      avgPongResponseTime: this.heartbeatManagers.length > 0 ? totalResponseTime / this.heartbeatManagers.length : 0,
      healthScore: this.heartbeatManagers.length > 0 ? totalHealthScore / this.heartbeatManagers.length : 0
    };

    console.log(`✅ Heartbeat performance under load:`);
    console.log(`  Total pings received: ${totalPings}`);
    console.log(`  Total pongs sent: ${totalPongs}`);
    console.log(`  Average response time: ${this.metrics.heartbeatStats.avgPongResponseTime.toFixed(3)}ms`);
    console.log(`  Average health score: ${this.metrics.heartbeatStats.healthScore.toFixed(3)}`);
    console.log(`  Pong success rate: ${totalPings > 0 ? ((totalPongs / totalPings) * 100).toFixed(1) : 0}%`);
  }

  /**
   * Test resource cleanup efficiency
   */
  private async testResourceCleanup(): Promise<void> {
    console.log('\n🧹 Phase 4: Testing Resource Cleanup');
    console.log('-' .repeat(40));

    const preCleanupMemory = process.memoryUsage();
    
    // Stop all heartbeat managers
    console.log('  Stopping heartbeat managers...');
    for (const manager of this.heartbeatManagers) {
      manager.stop();
    }

    // Close all connections
    console.log('  Closing WebSocket connections...');
    const closePromises = this.connections.map((ws, index) => {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.on('close', () => resolve());
          ws.close(1000, 'Test cleanup');
        } else {
          resolve();
        }
        // Timeout fallback
        setTimeout(() => resolve(), 2000);
      });
    });

    await Promise.all(closePromises);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    const postCleanupMemory = process.memoryUsage();

    // Calculate cleanup score based on memory recovery
    const heapUsedBefore = preCleanupMemory.heapUsed;
    const heapUsedAfter = postCleanupMemory.heapUsed;
    const memoryRecovered = Math.max(0, heapUsedBefore - heapUsedAfter);
    const recoveryRate = memoryRecovered / heapUsedBefore;
    
    this.metrics.resourceCleanupScore = Math.min(100, recoveryRate * 100 + 50); // Base score 50, up to 100

    console.log(`✅ Resource cleanup completed:`);
    console.log(`  Heap before cleanup: ${(heapUsedBefore / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap after cleanup: ${(heapUsedAfter / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory recovered: ${(memoryRecovered / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Cleanup score: ${this.metrics.resourceCleanupScore.toFixed(1)}/100`);
  }

  /**
   * Handle incoming message for throughput/latency measurement
   */
  private handleMessage(data: WebSocket.Data): void {
    this.metrics.messagesReceived++;

    try {
      const message = JSON.parse(data.toString());
      
      // Calculate latency if timestamp is available
      if (message.data && message.data.E) {
        const latency = Date.now() - message.data.E;
        
        if (latency > 0 && latency < 60000) { // Valid latency (< 1 minute)
          this.latencies.push(latency);
          
          // Keep only recent latencies to manage memory
          if (this.latencies.length > PERFORMANCE_CONFIG.latencyMeasurements) {
            this.latencies.shift();
          }
          
          this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
          this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
        }
      }
    } catch (error) {
      // Ignore JSON parsing errors for this test
    }
  }

  /**
   * Track memory usage over time
   */
  private trackMemoryUsage(): void {
    const currentMemory = process.memoryUsage();
    this.memorySnapshots.push(currentMemory);

    // Update peak memory
    if (currentMemory.heapUsed > this.metrics.memoryUsage.peak.heapUsed) {
      this.metrics.memoryUsage.peak = currentMemory;
    }

    console.log(`📊 Memory: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB heap, ${(currentMemory.rss / 1024 / 1024).toFixed(2)} MB RSS`);
  }

  /**
   * Calculate final metrics
   */
  private calculateFinalMetrics(): void {
    this.metrics.duration = Date.now() - this.startTime;
    this.metrics.memoryUsage.final = process.memoryUsage();

    // Calculate latency percentiles
    if (this.latencies.length > 0) {
      this.latencies.sort((a, b) => a - b);
      
      this.metrics.avgLatency = this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length;
      this.metrics.p95Latency = this.latencies[Math.floor(this.latencies.length * 0.95)];
      this.metrics.p99Latency = this.latencies[Math.floor(this.latencies.length * 0.99)];
    }
  }

  /**
   * Cleanup all resources
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Final cleanup...');
    
    // Ensure all heartbeat managers are stopped
    for (const manager of this.heartbeatManagers) {
      try {
        manager.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Ensure all connections are closed
    for (const ws of this.connections) {
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.connections = [];
    this.heartbeatManagers = [];
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const tester = new PerformanceTester();
  
  try {
    const metrics = await tester.runPerformanceTest();
    
    // Generate detailed performance report
    console.log('\n' + '=' .repeat(60));
    console.log('📊 PERFORMANCE TEST RESULTS');
    console.log('=' .repeat(60));
    
    console.log(`\n⏱️  TIMING METRICS:`);
    console.log(`  Test Duration: ${(metrics.duration / 1000).toFixed(1)} seconds`);
    console.log(`  Connections Created: ${metrics.connectionsCreated}`);
    
    console.log(`\n📈 THROUGHPUT METRICS:`);
    console.log(`  Total Messages: ${metrics.messagesReceived}`);
    console.log(`  Average Throughput: ${metrics.avgThroughput.toFixed(2)} msg/sec`);
    console.log(`  Per-Connection Throughput: ${metrics.connectionsCreated > 0 ? (metrics.avgThroughput / metrics.connectionsCreated).toFixed(2) : 0} msg/sec`);
    
    console.log(`\n⚡ LATENCY METRICS:`);
    console.log(`  Average Latency: ${metrics.avgLatency.toFixed(2)} ms`);
    console.log(`  Min Latency: ${metrics.minLatency === Number.MAX_VALUE ? 'N/A' : metrics.minLatency.toFixed(2)} ms`);
    console.log(`  Max Latency: ${metrics.maxLatency.toFixed(2)} ms`);
    console.log(`  95th Percentile: ${metrics.p95Latency.toFixed(2)} ms`);
    console.log(`  99th Percentile: ${metrics.p99Latency.toFixed(2)} ms`);
    
    console.log(`\n💓 HEARTBEAT PERFORMANCE:`);
    console.log(`  Total Pings: ${metrics.heartbeatStats.totalPings}`);
    console.log(`  Total Pongs: ${metrics.heartbeatStats.totalPongs}`);
    console.log(`  Avg Pong Response Time: ${metrics.heartbeatStats.avgPongResponseTime.toFixed(3)} ms`);
    console.log(`  Avg Health Score: ${metrics.heartbeatStats.healthScore.toFixed(3)}/1.0`);
    
    console.log(`\n💾 MEMORY USAGE:`);
    console.log(`  Initial Heap: ${(metrics.memoryUsage.initial.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Peak Heap: ${(metrics.memoryUsage.peak.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final Heap: ${(metrics.memoryUsage.final.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory Growth: ${((metrics.memoryUsage.peak.heapUsed - metrics.memoryUsage.initial.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\n🧹 RESOURCE CLEANUP:`);
    console.log(`  Cleanup Score: ${metrics.resourceCleanupScore.toFixed(1)}/100`);
    
    if (metrics.errors.length > 0) {
      console.log(`\n❌ ERRORS ENCOUNTERED:`);
      metrics.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }
    
    // Performance assessment
    console.log(`\n🎯 PERFORMANCE ASSESSMENT:`);
    
    const throughputScore = Math.min(100, (metrics.avgThroughput / 50) * 100); // 50 msg/sec baseline
    const latencyScore = Math.max(0, 100 - (metrics.avgLatency / 2)); // 200ms = 0 score
    const heartbeatScore = metrics.heartbeatStats.healthScore * 100;
    const memoryScore = Math.max(0, 100 - ((metrics.memoryUsage.peak.heapUsed - metrics.memoryUsage.initial.heapUsed) / 1024 / 1024)); // 1MB growth = -1 point
    
    const overallScore = (throughputScore + latencyScore + heartbeatScore + metrics.resourceCleanupScore + memoryScore) / 5;
    
    console.log(`  Throughput Score: ${throughputScore.toFixed(1)}/100`);
    console.log(`  Latency Score: ${latencyScore.toFixed(1)}/100`);
    console.log(`  Heartbeat Score: ${heartbeatScore.toFixed(1)}/100`);
    console.log(`  Memory Score: ${memoryScore.toFixed(1)}/100`);
    console.log(`  Cleanup Score: ${metrics.resourceCleanupScore.toFixed(1)}/100`);
    console.log(`  Overall Score: ${overallScore.toFixed(1)}/100`);
    
    // Final verdict
    let performanceLevel = 'POOR';
    if (overallScore >= 90) performanceLevel = 'EXCELLENT';
    else if (overallScore >= 80) performanceLevel = 'GOOD';
    else if (overallScore >= 70) performanceLevel = 'ACCEPTABLE';
    else if (overallScore >= 60) performanceLevel = 'FAIR';
    
    console.log(`  Performance Level: ${performanceLevel}`);
    
    const isPassing = overallScore >= 70 && metrics.errors.length === 0;
    console.log(`\n${isPassing ? '🏆' : '⚠️'} FINAL VERDICT: ${isPassing ? '✅ PERFORMANCE TEST PASSED' : '❌ PERFORMANCE TEST FAILED'}`);
    
    process.exit(isPassing ? 0 : 1);
    
  } catch (error) {
    console.error(`\n💥 Performance test crashed: ${error.message || error}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}