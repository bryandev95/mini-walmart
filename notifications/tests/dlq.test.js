const fs = require('fs');
const path = require('path');
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const assert = require('assert');
const { fork } = require('child_process');

// Load environment variables from .env.local
const envFile = path.join(__dirname, '../../.env.local');
const env = fs.existsSync(envFile) 
  ? Object.assign({}, process.env, require('dotenv').parse(fs.readFileSync(envFile)))
  : process.env;

// Configure SQS client
const sqs = new SQSClient({
  region: env.AWS_REGION || 'us-east-1',
  endpoint: env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

// Helper function to wait for condition with timeout
async function waitForCondition(condition, timeout = 30000, interval = 1000) {
  const startTime = Date.now();
  let lastError = null;
  let attempts = 0;
  
  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      if (await condition()) {
        return true;
      }
    } catch (error) {
      lastError = error;
      console.error(`Error checking condition (attempt ${attempts}):`, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  if (lastError) {
    throw lastError;
  }
  return false;
}

describe('DLQ Flow Tests', function() {
  this.timeout(60000); // Increase timeout for DLQ tests
  let worker;

  beforeEach(async function() {
    // Start worker process
    worker = fork(path.join(__dirname, '../index.js'), [], {
      env: env,
      stdio: 'pipe'
    });

    // Wait for worker to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker failed to start'));
      }, 5000);

      worker.stdout.on('data', (data) => {
        if (data.toString().includes('Starting notifications worker')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      worker.stderr.on('data', (data) => {
        console.error('Worker error:', data.toString());
      });
    });
  });

  afterEach(function() {
    if (worker) {
      worker.kill();
    }
  });

  it('should move failed message to DLQ and allow retry', async function() {
    const queueUrl = env.SQS_QUEUE_URL;
    const dlqUrl = env.SQS_DLQ_URL;
    assert(queueUrl, 'SQS_QUEUE_URL environment variable is required');
    assert(dlqUrl, 'SQS_DLQ_URL environment variable is required');

    // Create failing order
    const failingOrder = {
      eventType: 'OrderCreated',
      orderId: 'fail-me',
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
      Message: JSON.stringify(failingOrder),
      Timestamp: new Date().toISOString(),
    };

    console.log('Sending failing message to queue...');
    
    // Send message to main queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(snsMessage),
    }));

    console.log('Waiting for message to be moved to DLQ...');
    
    // Wait for message to appear in DLQ
    const messageInDLQ = await waitForCondition(async () => {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 1,
      }));
      
      if (response.Messages && response.Messages.length > 0) {
        const message = response.Messages[0];
        const snsMessage = JSON.parse(message.Body);
        const orderEvent = JSON.parse(snsMessage.Message);
        return orderEvent.orderId === 'fail-me';
      }
      return false;
    });

    assert(messageInDLQ, 'Message should have been moved to DLQ');

    console.log('Moving message from DLQ back to main queue...');

    // Get message from DLQ
    const dlqResponse = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqUrl,
      MaxNumberOfMessages: 1,
      VisibilityTimeout: 30,
    }));

    assert(dlqResponse.Messages && dlqResponse.Messages.length > 0, 'Should receive message from DLQ');

    // Move message back to main queue
    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: dlqResponse.Messages[0].Body,
    }));

    // Delete message from DLQ
    await sqs.send(new DeleteMessageCommand({
      QueueUrl: dlqUrl,
      ReceiptHandle: dlqResponse.Messages[0].ReceiptHandle,
    }));

    console.log('Waiting for DLQ to be empty...');

    // Wait for DLQ to be empty
    const dlqEmpty = await waitForCondition(async () => {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 1,
      }));
      return !response.Messages || response.Messages.length === 0;
    });

    assert(dlqEmpty, 'DLQ should be empty after retry');
  });
});