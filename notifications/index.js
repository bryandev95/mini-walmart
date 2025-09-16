require('dotenv').config({ path: '../.env.local' });
const express = require('express');
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SendMessageCommand,
  ChangeMessageVisibilityCommand,
} = require('@aws-sdk/client-sqs');

// Configure SQS client
const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT_URL && {
    endpoint: process.env.AWS_ENDPOINT_URL,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
});

// Configure queue URLs
const queueUrl = process.env.SQS_QUEUE_URL;
const dlqUrl = process.env.SQS_DLQ_URL;

if (!queueUrl || !dlqUrl) {
  console.error('❌ SQS_QUEUE_URL and SQS_DLQ_URL environment variables are required');
  process.exit(1);
}

// Create Express app for admin endpoints
const app = express();
app.use(express.json());

// Process SQS message
async function processMessage(message) {
  try {
    // Parse SNS message from SQS
    const snsMessage = JSON.parse(message.Body);
    const orderEvent = JSON.parse(snsMessage.Message);

    // Simulate failure for specific orderId
    if (orderEvent.orderId === 'fail-me') {
      throw new Error('Simulated failure for orderId: fail-me');
    }

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
    
    // Change visibility timeout to 0 to make message immediately available for retry
    try {
      await sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: 0,
      }));
    } catch (visibilityError) {
      console.error('Failed to change message visibility:', visibilityError);
    }
    
    throw error;
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
        VisibilityTimeout: 5, // Short timeout to trigger DLQ quickly
      });

      const response = await sqs.send(command);
      
      if (response.Messages) {
        for (const message of response.Messages) {
          try {
            await processMessage(message);
          } catch (error) {
            // Log error but continue polling
            console.error('❌ Error processing message:', error);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error polling messages:', error);
      // Wait before retrying on error
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Admin endpoint to list DLQ messages
app.get('/admin/dlq', async (req, res) => {
  try {
    // Get queue attributes
    const attributesResponse = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl: dlqUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    }));

    // Receive messages from DLQ
    const response = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqUrl,
      MaxNumberOfMessages: 10,
      VisibilityTimeout: 30,
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    }));

    const messages = response.Messages || [];

    // Change visibility timeout back to 0 for all messages
    await Promise.all(messages.map(msg => 
      sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: dlqUrl,
        ReceiptHandle: msg.ReceiptHandle,
        VisibilityTimeout: 0,
      }))
    ));

    const formattedMessages = messages.map(msg => {
      try {
        const snsMessage = JSON.parse(msg.Body);
        const orderEvent = JSON.parse(snsMessage.Message);
        return {
          messageId: msg.MessageId,
          receiptHandle: msg.ReceiptHandle,
          order: orderEvent,
          timestamp: snsMessage.Timestamp,
          approximateReceiveCount: msg.Attributes?.ApproximateReceiveCount,
        };
      } catch (error) {
        return {
          messageId: msg.MessageId,
          receiptHandle: msg.ReceiptHandle,
          error: 'Failed to parse message',
          rawBody: msg.Body,
        };
      }
    });

    res.json({
      queueAttributes: attributesResponse.Attributes,
      messages: formattedMessages,
    });
  } catch (error) {
    console.error('Error listing DLQ messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to retry DLQ messages
app.post('/admin/retry-dlq', async (req, res) => {
  try {
    // Receive messages from DLQ
    const response = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqUrl,
      MaxNumberOfMessages: 10,
      VisibilityTimeout: 30,
      AttributeNames: ['All'],
    }));

    const messages = response.Messages || [];
    const results = [];

    // Process each message
    for (const message of messages) {
      try {
        console.log('Retrying message:', message.MessageId);
        
        // Send message back to main queue
        await sqs.send(new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: message.Body,
          MessageAttributes: message.MessageAttributes || {},
        }));

        // Delete message from DLQ
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: dlqUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));

        console.log('Successfully retried message:', message.MessageId);
        
        results.push({
          messageId: message.MessageId,
          status: 'retried',
        });
      } catch (error) {
        console.error('Failed to retry message:', message.MessageId, error);
        
        // Change visibility timeout back to 0
        try {
          await sqs.send(new ChangeMessageVisibilityCommand({
            QueueUrl: dlqUrl,
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: 0,
          }));
        } catch (visibilityError) {
          console.error('Failed to reset visibility timeout:', visibilityError);
        }

        results.push({
          messageId: message.MessageId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    res.json({
      totalProcessed: messages.length,
      results,
    });
  } catch (error) {
    console.error('Error retrying DLQ messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start the worker and admin server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Admin server listening on port ${PORT}`);
  console.log('📬 Starting notifications worker...');
  pollMessages().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
});