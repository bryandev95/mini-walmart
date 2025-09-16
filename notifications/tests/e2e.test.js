require('dotenv').config({ path: '../../.env.local' });
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const assert = require('assert');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envFile = path.join(__dirname, '../../.env.local');
const env = fs.existsSync(envFile) 
  ? Object.assign({}, process.env, require('dotenv').parse(fs.readFileSync(envFile)))
  : process.env;

// Verify required environment variables
console.log('Environment variables loaded:', {
  SQS_QUEUE_URL: env.SQS_QUEUE_URL,
  SQS_DLQ_URL: env.SQS_DLQ_URL,
  AWS_ENDPOINT_URL: env.AWS_ENDPOINT_URL
});

// Configure SQS client
const sqs = new SQSClient({
  region: env.AWS_REGION || 'us-east-1',
  endpoint: env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

// Test order event
const testOrder = {
  eventType: 'OrderCreated',
  orderId: `test-order-${Date.now()}`,
  customerId: 'test-customer',
  items: [
    {
      productId: 'test-product',
      quantity: 2,
      price: 29.99,
    },
  ],
};

// Create SNS message structure
const snsMessage = {
  Type: 'Notification',
  MessageId: '12345',
  TopicArn: env.SNS_TOPIC_ARN,
  Message: JSON.stringify(testOrder),
  Timestamp: new Date().toISOString(),
};

describe('Notifications Service E2E Tests', function() {
  this.timeout(15000); // Increase timeout to 15 seconds
  let worker;

  beforeEach(function(done) {
    // Verify required environment variables
    assert(env.SQS_QUEUE_URL, 'SQS_QUEUE_URL environment variable is required');
    assert(env.SQS_DLQ_URL, 'SQS_DLQ_URL environment variable is required');

    // Start worker process
    worker = fork(path.join(__dirname, '../index.js'), [], {
      env: env,
      stdio: 'pipe'
    });

    // Wait for worker to be ready
    worker.stdout.on('data', (data) => {
      if (data.toString().includes('Starting notifications worker')) {
        done();
      }
    });

    // Log worker errors
    worker.stderr.on('data', (data) => {
      console.error('Worker error:', data.toString());
    });
  });

  afterEach(function() {
    // Stop worker process
    if (worker) {
      worker.kill();
    }
  });

  it('should process order notification from SQS', async () => {
    // Send message to SQS
    await sqs.send(new SendMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(snsMessage),
    }));

    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to receive the message (should be deleted if processed)
    const response = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));

    // Message should be processed and deleted
    assert.strictEqual(response.Messages, undefined, 'Message should be processed and deleted');
  });

  it('should send failed messages to DLQ', async () => {
    assert(env.SQS_DLQ_URL, 'SQS_DLQ_URL environment variable is required');

    // Create invalid message
    const invalidMessage = {
      Type: 'Notification',
      MessageId: '12345',
      TopicArn: env.SNS_TOPIC_ARN,
      Message: 'invalid json',
      Timestamp: new Date().toISOString(),
    };

    // Send invalid message to main queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(invalidMessage),
    }));

    // Wait for message processing and redrive
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Check DLQ for message
    const response = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: env.SQS_DLQ_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));

    // Should find message in DLQ
    assert(response.Messages && response.Messages.length > 0, 'Failed message should be in DLQ');

    // Clean up DLQ
    if (response.Messages) {
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: env.SQS_DLQ_URL,
        ReceiptHandle: response.Messages[0].ReceiptHandle,
      }));
    }
  });
});