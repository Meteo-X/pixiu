#!/usr/bin/env ts-node

/**
 * Google Cloud Pub/Sub Connection Test
 * 
 * This script tests the Google Cloud Pub/Sub connection and verifies
 * that the authentication and project setup are working correctly.
 */

import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: '/workspaces/pixiu/.env.gcloud' });

// Also try to load from the environment file manually if dotenv didn't work
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  try {
    const envContent = fs.readFileSync('/workspaces/pixiu/.env.gcloud', 'utf8');
    const envVars = envContent.split('\n').filter(line => line && !line.startsWith('#'));
    envVars.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn('Could not load .env.gcloud file:', error);
  }
}

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  details?: unknown;
}

class GoogleCloudTester {
  private pubsub: PubSub;
  private projectId: string;
  private results: TestResult[] = [];

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT!;
    this.pubsub = new PubSub({
      projectId: this.projectId,
    });

    if (!this.projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }
  }

  private addResult(test: string, status: 'PASS' | 'FAIL', message: string, details?: unknown): void {
    this.results.push({ test, status, message, details });
  }

  private printResults(): void {
    console.log('\n🧪 Google Cloud Connection Test Results');
    console.log('==========================================');
    
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${index + 1}. ${icon} ${result.test}`);
      console.log(`   ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
      console.log('');
    });

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const total = this.results.length;
    
    console.log(`📊 Summary: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Google Cloud setup is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please check your Google Cloud configuration.');
      process.exit(1);
    }
  }

  async testAuthentication(): Promise<void> {
    try {
      // Test basic authentication by trying to list topics (most basic operation)
      await this.pubsub.getTopics({ pageSize: 1 });
      this.addResult(
        'Authentication',
        'PASS',
        `Successfully authenticated with project: ${this.projectId}`
      );
    } catch (error) {
      this.addResult(
        'Authentication',
        'FAIL',
        `Failed to authenticate with Google Cloud: ${error}`,
        error
      );
    }
  }

  async testTopicAccess(): Promise<void> {
    try {
      // List topics to test Pub/Sub access
      const [topics] = await this.pubsub.getTopics();
      this.addResult(
        'Pub/Sub Topic Access',
        'PASS',
        `Successfully accessed Pub/Sub. Found ${topics.length} topics.`,
        { topicCount: topics.length, topics: topics.map(t => t.name) }
      );
    } catch (error) {
      this.addResult(
        'Pub/Sub Topic Access',
        'FAIL',
        `Failed to access Pub/Sub topics: ${error}`,
        error
      );
    }
  }

  async testTopicCreation(): Promise<void> {
    const testTopicName = 'pixiu-test-topic';
    
    try {
      // Create a test topic
      const [topic] = await this.pubsub.createTopic(testTopicName);
      
      // Verify it exists
      const [exists] = await topic.exists();
      
      if (exists) {
        this.addResult(
          'Topic Creation',
          'PASS',
          `Successfully created and verified test topic: ${testTopicName}`
        );
        
        // Clean up - delete the test topic
        await topic.delete();
      } else {
        this.addResult(
          'Topic Creation',
          'FAIL',
          `Topic was created but verification failed: ${testTopicName}`
        );
      }
    } catch (error) {
      // Check if topic already exists
      if (error instanceof Error && error.message.includes('already exists')) {
        this.addResult(
          'Topic Creation',
          'PASS',
          `Topic creation permissions verified (topic already exists): ${testTopicName}`
        );
        
        // Try to delete existing test topic
        try {
          await this.pubsub.topic(testTopicName).delete();
        } catch (deleteError) {
          // Ignore delete errors for existing topics
        }
      } else {
        this.addResult(
          'Topic Creation',
          'FAIL',
          `Failed to create test topic: ${error}`,
          error
        );
      }
    }
  }

  async testMessagePublishing(): Promise<void> {
    const testTopicName = 'pixiu-test-publish';
    
    try {
      // Create test topic
      const [topic] = await this.pubsub.createTopic(testTopicName);
      
      // Publish a test message
      const testMessage = {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: 'test',
        timestamp: Date.now(),
        data: { message: 'Hello from Pixiu!' }
      };
      
      const messageId = await topic.publishMessage({
        data: Buffer.from(JSON.stringify(testMessage)),
        attributes: {
          exchange: 'binance',
          symbol: 'BTCUSDT',
          type: 'test'
        }
      });
      
      this.addResult(
        'Message Publishing',
        'PASS',
        `Successfully published test message with ID: ${messageId}`
      );
      
      // Clean up
      await topic.delete();
      
    } catch (error) {
      this.addResult(
        'Message Publishing',
        'FAIL',
        `Failed to publish test message: ${error}`,
        error
      );
    }
  }

  async testEnvironmentVariables(): Promise<void> {
    const requiredVars = [
      'GOOGLE_CLOUD_PROJECT',
      'GOOGLE_APPLICATION_CREDENTIALS'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      this.addResult(
        'Environment Variables',
        'PASS',
        'All required environment variables are set',
        {
          GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
          GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET'
        }
      );
    } else {
      this.addResult(
        'Environment Variables',
        'FAIL',
        `Missing required environment variables: ${missingVars.join(', ')}`,
        { missingVars }
      );
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🔍 Starting Google Cloud connection tests...');
    console.log(`📋 Project ID: ${this.projectId}`);
    console.log(`🔐 Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Configured' : 'Not configured'}`);
    
    await this.testEnvironmentVariables();
    await this.testAuthentication();
    await this.testTopicAccess();
    await this.testTopicCreation();
    await this.testMessagePublishing();
    
    this.printResults();
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const tester = new GoogleCloudTester();
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Failed to initialize Google Cloud tester:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}