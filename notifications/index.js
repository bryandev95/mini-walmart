require('dotenv').config({ path: '../.env.local' });

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');

// Configure SQS client
const sqs = new SQSClient({
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
});

// Configure queue URL
const queueUrl = process.env.SQS_QUEUE_URL;
if (!queueUrl) {
  console.error('❌ SQS_QUEUE_URL environment variable is required');
  process.exit(1);
}

// Process SQS message
async function processMessage(message) {
  try {
    // Parse SNS message from SQS
    const snsMessage = JSON.parse(message.Body);
    const orderEvent = JSON.parse(snsMessage.Message);

    // Log fake email
    console.log('\n📧 Sending fake email for order:', {
      eventType: orderEvent.eventType,
      orderId: orderEvent.orderId,
      customerId: orderEvent.customerId,
      itemCount: orderEvent.items.length,
      total: orderEvent.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    });

    // Delete message from queue
    await sqs.send(new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: message.ReceiptHandle,
    }));

    console.log('✅ Message processed and deleted');
  } catch (error) {
    console.error('❌ Error processing message:', error);
    // Don't delete the message - it will return to the queue after visibility timeout
  }
}

// Long-polling loop to receive messages
async function pollMessages() {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20, // Long polling
      });

      const response = await sqs.send(command);
      
      if (response.Messages) {
        for (const message of response.Messages) {
          await processMessage(message);
        }
      }
    } catch (error) {
      console.error('❌ Error polling messages:', error);
      // Wait before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start the worker
console.log('🚀 Starting notifications worker...');
console.log('📬 Listening for messages on', queueUrl);
pollMessages().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
