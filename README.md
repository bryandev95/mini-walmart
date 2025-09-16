# Mini-Walmart Order Processing System

[![CI/CD](https://github.com/yourusername/mini-walmart/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/mini-walmart/actions/workflows/ci.yml)

A microservices-based order processing system that demonstrates event-driven architecture using AWS services (SNS/SQS) and LocalStack for local development.

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration and deployment:

- **Automated Tests**: Unit and E2E tests run on every push and pull request
- **Multiple Environments**: Tests run against Go 1.21 and Node.js 18
- **Linting**: Code quality checks with golangci-lint and ESLint
- **Caching**: Optimized builds with dependency caching
- **LocalStack Integration**: E2E tests run against LocalStack in CI

## Architecture

The system consists of two main components:

1. **Orders Service (Go/Gin)**
   - RESTful API for order creation
   - Publishes OrderCreated events to SNS topic

2. **Notifications Service (Node.js)**
   - Consumes messages from SQS queue
   - Processes order notifications (simulated email sending)

## Prerequisites

- Go 1.21+
- Node.js 18+
- Docker and Docker Compose
- LocalStack (via Docker Compose)
- AWS CLI (for local testing)

## Local Development Setup

### Environment Variables

Set the following environment variables for local development:

```bash
# AWS/LocalStack Configuration
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_ENDPOINT_URL=http://localhost:4566

```

### Starting Services

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mini-walmart.git
   cd mini-walmart
   ```

2. **Start LocalStack**
   ```bash
   # Start LocalStack and UI
   docker-compose up -d

   # Verify LocalStack is running
   aws --endpoint-url=http://localhost:4566 sns list-topics

   ```

3. **Run Orders Service**
   ```bash
   cd orders
   go mod download
   go run cmd/main.go
   ```

4. **Run Notifications Service**
   ```bash
   cd notifications
   npm install
   npm start
   ```

## API Endpoints

### Orders Service
- `POST /api/orders` - Create a new order
  ```json
  {
    "orderId": "string",
    "customerId": "string",
    "items": [
      {
        "productId": "string",
        "quantity": number,
        "price": number
      }
    ]
  }
  ```

## Testing

### Automated Tests

The project includes both unit tests and end-to-end (E2E) tests.

#### Run All Tests
```bash
# Make sure LocalStack is running
docker-compose up -d

# Run all E2E tests
./scripts/run-e2e-tests.sh
```

#### Unit Tests

#### Orders Service
```bash
cd orders
go test ./...
```

#### Notifications Service
```bash
cd notifications
npm test
```

### End-to-End Testing

Follow these steps to test the complete order flow locally:

1. **Start LocalStack**
   ```bash
   # Start LocalStack
   docker-compose up -d

   # Set up AWS resources
   ./scripts/setup-local-aws.sh

   # Verify resources
   aws --endpoint-url=http://localhost:4566 sns list-topics
   aws --endpoint-url=http://localhost:4566 sqs list-queues
   ```

2. **Start Orders Service**
   ```bash
   # Load environment variables
   source .env.local

   # Start service
   cd orders
   go run cmd/main.go
   ```
   You should see: `Listening and serving HTTP on :8080`

3. **Start Notifications Worker**
   ```bash
   # In another terminal
   source .env.local
   cd notifications
   npm start
   ```
   You should see: `🚀 Starting notifications worker...`

4. **Create Test Order**
   ```bash
   # In another terminal
   curl -X POST http://localhost:8080/orders \
     -H "Content-Type: application/json" \
     -d '{
       "orderId": "ord123",
       "customerId": "cust456",
       "items": [
         {
           "productId": "prod789",
           "quantity": 2,
           "price": 29.99
         }
       ]
     }'
   ```

5. **Verify Results**

   a. Orders Service should return 201 status with the order JSON
   
   b. Notifications Worker should log:
   ```
   📧 Sending fake email for order: {
     eventType: 'OrderCreated',
     orderId: 'ord123',
     customerId: 'cust456',
     ...
   }
   ✅ Message processed and deleted
   ```

   c. Verify message in SQS (optional):
   ```bash
   # Before the worker processes it
   aws --endpoint-url=http://localhost:4566 sqs receive-message \
     --queue-url $SQS_QUEUE_URL
   ```

### Troubleshooting

1. **LocalStack Issues**
   - Ensure Docker is running
   - Try restarting LocalStack: `docker-compose restart`
   - Run setup script again: `./scripts/setup-local-aws.sh`

2. **Orders Service Issues**
   - Check SNS_TOPIC_ARN is set correctly
   - Verify AWS_ENDPOINT_URL points to LocalStack
   - Check logs for any publishing errors

3. **Notifications Worker Issues**
   - Ensure SQS_QUEUE_URL is correct
   - Check AWS credentials are set
   - Verify connection to LocalStack

## Infrastructure

The project uses LocalStack to emulate AWS services locally:

### AWS Resources
- SNS Topic (`orders-topic`) for order events
- SQS Queue (`notifications-queue`) subscribed to the SNS topic
- Dead Letter Queue (`notifications-dlq`) for failed message handling

### Local Setup

1. Start LocalStack:
   ```bash
   docker-compose up -d
   ```

2. Set up AWS resources:
   ```bash
   # Run the setup script
   ./scripts/setup-local-aws.sh

   # Verify setup
   aws --endpoint-url=http://localhost:4566 sns list-topics
   aws --endpoint-url=http://localhost:4566 sqs list-queues
   ```

The setup script will create all necessary resources and save the ARNs to `.env.local` for application use.

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Submit a pull request to `dev`

## License

MIT
