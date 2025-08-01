#!/usr/bin/env npx ts-node

/**
 * Focused Heartbeat Compliance Test
 * 
 * Tests the critical Binance WebSocket ping/pong heartbeat mechanism
 * according to the official specification:
 * - Server sends ping frame every 20 seconds
 * - Client must immediately send pong frame copying the ping payload
 * - If server doesn't receive pong within 60 seconds, connection will be disconnected
 * - Unsolicited pong frames are allowed but won't prevent disconnection
 */

import WebSocket from 'ws';

const BINANCE_WS_URL = 'wss://stream.binance.com:9443';

interface HeartbeatTestResults {
  testDuration: number;
  connectionEstablished: boolean;
  pingsReceived: number;
  pongsSent: number;
  unsolicitedPongsSent: number;
  avgPongResponseTime: number;
  maxPongResponseTime: number;
  minPongResponseTime: number;
  heartbeatIntervals: number[];
  connectionStable: boolean;
  complianceScore: number;
  errors: string[];
}

class HeartbeatComplianceTest {
  private ws: WebSocket | null = null;
  private results: HeartbeatTestResults;
  private testStartTime: number = 0;
  private lastPingTime: number = 0;
  private pongResponseTimes: number[] = [];
  private heartbeatIntervals: number[] = [];
  private unsolicitedPongTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.results = {
      testDuration: 0,
      connectionEstablished: false,
      pingsReceived: 0,
      pongsSent: 0,
      unsolicitedPongsSent: 0,
      avgPongResponseTime: 0,
      maxPongResponseTime: 0,
      minPongResponseTime: Number.MAX_VALUE,
      heartbeatIntervals: [],
      connectionStable: false,
      complianceScore: 0,
      errors: []
    };
  }

  /**
   * Run comprehensive heartbeat compliance test
   */
  public async runTest(testDurationMs: number = 90000): Promise<HeartbeatTestResults> {
    console.log('💓 Starting Binance WebSocket Heartbeat Compliance Test');
    console.log('=' .repeat(60));
    console.log(`Test Duration: ${testDurationMs / 1000} seconds`);
    console.log(`Expected Ping Interval: 20 seconds (as per Binance spec)`);
    console.log(`Ping Timeout Threshold: 60 seconds`);
    console.log('');

    this.testStartTime = Date.now();

    return new Promise((resolve) => {
      try {
        this.establishConnection();

        // End test after specified duration
        setTimeout(() => {
          this.endTest();
          resolve(this.calculateResults());
        }, testDurationMs);

      } catch (error) {
        this.results.errors.push(`Test setup failed: ${error.message || error}`);
        resolve(this.calculateResults());
      }
    });
  }

  /**
   * Establish WebSocket connection
   */
  private establishConnection(): void {
    const wsUrl = `${BINANCE_WS_URL}/ws/btcusdt@trade`;
    console.log(`🔌 Connecting to: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connection established');
      this.results.connectionEstablished = true;
      this.startUnsolicitedPongTimer();
    });

    this.ws.on('ping', (payload: Buffer) => {
      this.handlePing(payload);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      // Handle regular data messages (to keep connection active)
      try {
        const message = JSON.parse(data.toString());
        if (message.e === 'trade') {
          // Connection is receiving data, so it's stable
          this.results.connectionStable = true;
        }
      } catch (error) {
        // Ignore parsing errors for this test
      }
    });

    this.ws.on('error', (error) => {
      console.error(`❌ WebSocket error: ${error.message}`);
      this.results.errors.push(`WebSocket error: ${error.message}`);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
      if (code !== 1000) { // 1000 is normal closure
        this.results.errors.push(`Unexpected close: ${code} ${reason.toString()}`);
      }
    });
  }

  /**
   * Handle server ping (core compliance test)
   */
  private handlePing(payload: Buffer): void {
    const pingTime = Date.now();
    
    // Calculate interval since last ping
    if (this.lastPingTime > 0) {
      const interval = pingTime - this.lastPingTime;
      this.heartbeatIntervals.push(interval);
      console.log(`💓 Ping received (interval: ${interval}ms, payload size: ${payload.length} bytes)`);
    } else {
      console.log(`💓 First ping received (payload size: ${payload.length} bytes)`);
    }

    this.lastPingTime = pingTime;
    this.results.pingsReceived++;

    // Send pong immediately (Binance requirement: copy ping payload)
    const pongStartTime = process.hrtime.bigint();
    
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.pong(payload); // Copy ping payload as required by Binance
        
        const pongEndTime = process.hrtime.bigint();
        const responseTime = Number(pongEndTime - pongStartTime) / 1_000_000; // Convert to milliseconds
        
        this.pongResponseTimes.push(responseTime);
        this.results.pongsSent++;
        
        console.log(`🏓 Pong sent (response time: ${responseTime.toFixed(3)}ms)`);
      } else {
        this.results.errors.push('Cannot send pong: WebSocket not open');
      }
    } catch (error) {
      this.results.errors.push(`Failed to send pong: ${error.message || error}`);
    }
  }

  /**
   * Start unsolicited pong timer (optional as per Binance spec)
   */
  private startUnsolicitedPongTimer(): void {
    // Send unsolicited pong every 30 seconds (optional feature)
    this.unsolicitedPongTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.pong(); // Empty payload for unsolicited pong
          this.results.unsolicitedPongsSent++;
          console.log(`🏓 Unsolicited pong sent`);
        } catch (error) {
          this.results.errors.push(`Failed to send unsolicited pong: ${error.message || error}`);
        }
      }
    }, 30000);
  }

  /**
   * End the test and cleanup
   */
  private endTest(): void {
    console.log('\n⏰ Test duration completed, ending test...');

    if (this.unsolicitedPongTimer) {
      clearInterval(this.unsolicitedPongTimer);
      this.unsolicitedPongTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Test completed');
    }
  }

  /**
   * Calculate final test results and compliance score
   */
  private calculateResults(): HeartbeatTestResults {
    this.results.testDuration = Date.now() - this.testStartTime;

    // Calculate pong response time statistics
    if (this.pongResponseTimes.length > 0) {
      this.results.avgPongResponseTime = 
        this.pongResponseTimes.reduce((sum, time) => sum + time, 0) / this.pongResponseTimes.length;
      this.results.maxPongResponseTime = Math.max(...this.pongResponseTimes);
      this.results.minPongResponseTime = Math.min(...this.pongResponseTimes);
    }

    this.results.heartbeatIntervals = [...this.heartbeatIntervals];

    // Calculate compliance score (0-100)
    this.results.complianceScore = this.calculateComplianceScore();

    return { ...this.results };
  }

  /**
   * Calculate compliance score based on Binance specifications
   */
  private calculateComplianceScore(): number {
    let score = 0;

    // Connection established (20 points)
    if (this.results.connectionEstablished) {
      score += 20;
    }

    // Received pings (20 points)
    if (this.results.pingsReceived > 0) {
      score += 20;
    }

    // Sent pongs for all pings (20 points)
    if (this.results.pongsSent >= this.results.pingsReceived && this.results.pingsReceived > 0) {
      score += 20;
    }

    // Pong response time < 5 seconds (15 points)
    if (this.results.avgPongResponseTime < 5000) {
      score += 15;
    }

    // Heartbeat intervals close to 20 seconds (15 points)
    if (this.heartbeatIntervals.length > 0) {
      const avgInterval = this.heartbeatIntervals.reduce((sum, interval) => sum + interval, 0) / this.heartbeatIntervals.length;
      const deviation = Math.abs(avgInterval - 20000) / 20000; // 20 seconds expected
      if (deviation < 0.25) { // Within 25% of expected
        score += 15;
      } else if (deviation < 0.5) { // Within 50% of expected
        score += 10;
      } else if (deviation < 0.75) { // Within 75% of expected
        score += 5;
      }
    }

    // No critical errors (10 points)
    const criticalErrors = this.results.errors.filter(err => 
      err.includes('close') || err.includes('timeout') || err.includes('disconnect')
    );
    if (criticalErrors.length === 0) {
      score += 10;
    }

    return Math.min(100, score);
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const tester = new HeartbeatComplianceTest();
  
  try {
    const results = await tester.runTest(90000); // 90 second test
    
    // Print detailed results
    console.log('\n' + '=' .repeat(60));
    console.log('📋 HEARTBEAT COMPLIANCE TEST RESULTS');
    console.log('=' .repeat(60));
    
    console.log(`Test Duration: ${(results.testDuration / 1000).toFixed(1)} seconds`);
    console.log(`Connection Established: ${results.connectionEstablished ? '✅' : '❌'}`);
    console.log(`Connection Stable: ${results.connectionStable ? '✅' : '❌'}`);
    console.log('');
    
    console.log('📊 PING/PONG STATISTICS:');
    console.log(`  Pings Received: ${results.pingsReceived}`);
    console.log(`  Pongs Sent: ${results.pongsSent}`);
    console.log(`  Unsolicited Pongs Sent: ${results.unsolicitedPongsSent}`);
    console.log(`  Pong Success Rate: ${results.pingsReceived > 0 ? ((results.pongsSent / results.pingsReceived) * 100).toFixed(1) : 0}%`);
    console.log('');
    
    console.log('⏱️  RESPONSE TIME METRICS:');
    console.log(`  Average Pong Response Time: ${results.avgPongResponseTime.toFixed(3)} ms`);
    console.log(`  Min Pong Response Time: ${results.minPongResponseTime === Number.MAX_VALUE ? 'N/A' : results.minPongResponseTime.toFixed(3)} ms`);
    console.log(`  Max Pong Response Time: ${results.maxPongResponseTime.toFixed(3)} ms`);
    console.log('');
    
    console.log('💓 HEARTBEAT INTERVAL ANALYSIS:');
    if (results.heartbeatIntervals.length > 0) {
      const avgInterval = results.heartbeatIntervals.reduce((sum, interval) => sum + interval, 0) / results.heartbeatIntervals.length;
      const minInterval = Math.min(...results.heartbeatIntervals);
      const maxInterval = Math.max(...results.heartbeatIntervals);
      
      console.log(`  Heartbeat Intervals Measured: ${results.heartbeatIntervals.length}`);
      console.log(`  Average Interval: ${(avgInterval / 1000).toFixed(1)} seconds`);
      console.log(`  Min Interval: ${(minInterval / 1000).toFixed(1)} seconds`);
      console.log(`  Max Interval: ${(maxInterval / 1000).toFixed(1)} seconds`);
      console.log(`  Expected Interval: 20.0 seconds (Binance spec)`);
      console.log(`  Deviation from Expected: ${(Math.abs(avgInterval - 20000) / 20000 * 100).toFixed(1)}%`);
    } else {
      console.log(`  No heartbeat intervals measured`);
    }
    console.log('');
    
    if (results.errors.length > 0) {
      console.log('❌ ERRORS ENCOUNTERED:');
      results.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
      console.log('');
    }
    
    console.log('🎯 COMPLIANCE ASSESSMENT:');
    console.log(`  Overall Compliance Score: ${results.complianceScore}/100`);
    
    let complianceLevel = 'FAIL';
    if (results.complianceScore >= 90) {
      complianceLevel = 'EXCELLENT';
    } else if (results.complianceScore >= 80) {
      complianceLevel = 'GOOD';
    } else if (results.complianceScore >= 70) {
      complianceLevel = 'ACCEPTABLE';
    } else if (results.complianceScore >= 60) {
      complianceLevel = 'POOR';
    }
    
    console.log(`  Compliance Level: ${complianceLevel}`);
    console.log('');
    
    // Specific compliance checks
    console.log('✅ BINANCE SPECIFICATION COMPLIANCE:');
    console.log(`  Server sends ping frames: ${results.pingsReceived > 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Client sends pong for each ping: ${results.pongsSent >= results.pingsReceived ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Pong response time < 5s: ${results.avgPongResponseTime < 5000 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Connection remains stable: ${results.connectionStable ? '✅ PASS' : '❌ FAIL'}`);
    
    if (results.heartbeatIntervals.length > 0) {
      const avgInterval = results.heartbeatIntervals.reduce((sum, interval) => sum + interval, 0) / results.heartbeatIntervals.length;
      const withinExpectedRange = Math.abs(avgInterval - 20000) < 5000; // ±5 seconds tolerance
      console.log(`  Ping interval ~20s: ${withinExpectedRange ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    console.log('');
    
    // Final verdict
    const isPassing = results.complianceScore >= 80 && 
                     results.connectionEstablished && 
                     results.pingsReceived > 0 && 
                     results.pongsSent >= results.pingsReceived;
    
    console.log(`🏆 FINAL VERDICT: ${isPassing ? '✅ HEARTBEAT COMPLIANCE TEST PASSED' : '❌ HEARTBEAT COMPLIANCE TEST FAILED'}`);
    
    process.exit(isPassing ? 0 : 1);
    
  } catch (error) {
    console.error(`\n💥 Test crashed: ${error.message || error}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}