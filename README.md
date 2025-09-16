# Mini-Walmart Order Processing System

A microservices-based order processing system that demonstrates event-driven architecture using AWS services (SNS/SQS) and LocalStack for local development.

## Architecture

The system consists of two main components:

1. **Orders Service (Go/Gin)**
   - RESTful API for order creation
   - Publishes `OrderCreated` events to SNS topic
   - Built with Go 1.21 and Gin framework

2. **Notifications Service (Node.js)**
   - Consumes messages from SQS queue
   - Processes order notifications (simulated email sending)
   - Includes DLQ handling for failed messages
   - Built with Node.js 18

## Prerequisites

- Go 1.21+
- Node.js 18+
- Docker and Docker Compose
- AWS CLI (for local testing)
- jq (for infrastructure scripts)

## Environment Variables

All environment variables are automatically set up in `.env.local` by the setup script.

### Orders Service
- `AWS_REGION`: AWS region (default: us-east-1)
- `AWS_ENDPOINT_URL`: LocalStack endpoint
- `SNS_TOPIC_ARN`: ARN of the SNS topic
- `AWS_ACCESS_KEY_ID`: AWS access key (test for LocalStack)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key (test for LocalStack)

### Notifications Service
- `AWS_REGION`: AWS region (default: us-east-1)
- `AWS_ENDPOINT_URL`: LocalStack endpoint
- `SQS_QUEUE_URL`: URL of the main SQS queue
- `SQS_DLQ_URL`: URL of the Dead Letter Queue
- `AWS_ACCESS_KEY_ID`: AWS access key (test for LocalStack)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key (test for LocalStack)

## Development

### Code Structure
```
mini-walmart/
├─ orders/                # Go service
│  ├─ cmd/main.go        # Entry point
│  ├─ api/handlers.go    # HTTP handlers
│  └─ internal/sns/      # SNS publisher
├─ notifications/        # Node.js service
│  ├─ index.js          # Worker entry point
│  └─ tests/            # Test files
└─ scripts/             # Infrastructure scripts
```

## Monitoring and Logs

### LocalStack Logs
```bash
# View LocalStack logs
docker logs -f mini-walmart-localstack

# View SNS topics
aws --endpoint-url=http://localhost:4566 sns list-topics

# View SQS queues
aws --endpoint-url=http://localhost:4566 sqs list-queues

# View messages in DLQ
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url $SQS_DLQ_URL
```

### Application Logs

1. **Orders Service**
   - Logs to stdout/stderr
   - Debug logs prefixed with [GIN]
   - Error logs for SNS publishing failures

2. **Notifications Service**
   - Logs to stdout/stderr
   - Worker logs prefixed with 📬
   - Email notifications prefixed with 📧
   - Error logs prefixed with ❌

## Troubleshooting

### Common Issues

1. **LocalStack Connection Issues**
   ```bash
   # Check LocalStack health
   curl http://localhost:4566/_localstack/health

   # Restart LocalStack
   docker-compose restart

   # Recreate infrastructure
   ./scripts/setup-local-aws.sh
   ```

2. **Orders Service Issues**
   - Check SNS_TOPIC_ARN is set correctly
   - Verify AWS_ENDPOINT_URL points to LocalStack
   - Check logs for any publishing errors
   ```bash
   # Verify SNS topic
   aws --endpoint-url=http://localhost:4566 sns list-topics
   ```

3. **Notifications Service Issues**
   - Ensure SQS_QUEUE_URL is correct
   - Check AWS credentials are set
   - Verify connection to LocalStack
   ```bash
   # Check queue exists
   aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes \
     --queue-url $SQS_QUEUE_URL \
     --attribute-names All
   ```

4. **Message Flow Issues**
   - Check SNS subscription exists
   ```bash
   aws --endpoint-url=http://localhost:4566 sns list-subscriptions
   ```
   - Verify message format
   ```bash
   # Check messages in queue
   aws --endpoint-url=http://localhost:4566 sqs receive-message \
     --queue-url $SQS_QUEUE_URL
   ```

### Verification Steps

1. **Infrastructure**
   ```bash
   # Check all components
   ./scripts/setup-local-aws.sh
   ```

2. **Orders Service**
   ```bash
   # Create order
   curl -X POST http://localhost:8080/orders \
     -H "Content-Type: application/json" \
     -d '{"orderId":"test","customerId":"test","items":[{"productId":"test","quantity":1,"price":10}]}'
   ```

3. **Notifications Service**
   - Check worker logs for 📧 email notifications
   - Verify DLQ handling with failing messages

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass:
   ```bash
   # Run all checks
   ./scripts/run-e2e-tests.sh
   ```
4. Submit a pull request

## License

MIT