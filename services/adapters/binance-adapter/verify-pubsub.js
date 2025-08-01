const { PubSub } = require('@google-cloud/pubsub');

async function verify() {
  console.log('🔍 Verifying Google Cloud Pub/Sub with Service Account');
  console.log('===================================================');
  
  // Load environment variables
  require('dotenv').config({ path: '/workspaces/pixiu/.env.gcloud' });
  
  console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT);
  console.log('Credentials file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
  console.log('');
  
  const pubsub = new PubSub();
  
  try {
    console.log('📋 Listing existing topics...');
    const [topics] = await pubsub.getTopics();
    console.log(`✅ Found ${topics.length} topics:`);
    topics.forEach(topic => console.log(`  - ${topic.name}`));
    console.log('');
    
    console.log('🆕 Creating test topic...');
    const testTopicName = 'verification-test-' + Date.now();
    const [testTopic] = await pubsub.createTopic(testTopicName);
    console.log(`✅ Created topic: ${testTopic.name}`);
    
    console.log('📤 Publishing test message...');
    const messageId = await testTopic.publishMessage({
      data: Buffer.from(JSON.stringify({
        test: 'Hello from Pixiu!',
        timestamp: Date.now()
      })),
      attributes: {
        source: 'verification',
        type: 'test'
      }
    });
    console.log(`✅ Published message ID: ${messageId}`);
    
    console.log('🗑️ Cleaning up test topic...');
    await testTopic.delete();
    console.log('✅ Test topic deleted');
    
    console.log('');
    console.log('🎉 All verification tests passed!');
    console.log('✅ Google Cloud Pub/Sub is working correctly with service account credentials');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

verify();