#!/usr/bin/env ts-node

import { PubSub } from '@google-cloud/pubsub';

async function simpleTest(): Promise<void> {
  console.log('🔍 Simple Google Cloud Pub/Sub Test');
  console.log('===================================');
  
  console.log('Environment variables:');
  console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  console.log('');
  
  try {
    // Create Pub/Sub client
    const pubsub = new PubSub({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
    
    console.log('✅ Pub/Sub client created');
    
    // Try to list topics
    console.log('🔍 Attempting to list topics...');
    const [topics] = await pubsub.getTopics();
    console.log(`✅ Successfully listed ${topics.length} topics`);
    
    if (topics.length > 0) {
      console.log('Topics:');
      topics.forEach(topic => console.log(`  - ${topic.name}`));
    }
    
    // Try to create a test topic
    console.log('🔍 Attempting to create test topic...');
    const testTopicName = 'test-connection-' + Date.now();
    
    try {
      const [topic] = await pubsub.createTopic(testTopicName);
      console.log(`✅ Successfully created topic: ${topic.name}`);
      
      // Delete the test topic
      await topic.delete();
      console.log('✅ Successfully deleted test topic');
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log('ℹ️  Topic already exists (this is fine)');
      } else {
        throw error;
      }
    }
    
    console.log('');
    console.log('🎉 All tests passed! Google Cloud Pub/Sub connection is working.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('PERMISSION_DENIED')) {
        console.log('');
        console.log('💡 Permission denied. This could be because:');
        console.log('1. The service account key is not properly configured');
        console.log('2. The service account lacks the required permissions');
        console.log('3. The Pub/Sub API is not enabled');
        console.log('');
        console.log('Try running these commands:');
        console.log('gcloud services enable pubsub.googleapis.com');
        console.log('gcloud auth application-default login');
      }
      
      if (error.message.includes('UNAUTHENTICATED')) {
        console.log('');
        console.log('💡 Authentication failed. Try:');
        console.log('gcloud auth application-default login');
        console.log('Or check GOOGLE_APPLICATION_CREDENTIALS path');
      }
    }
    
    process.exit(1);
  }
}

simpleTest().catch(console.error);