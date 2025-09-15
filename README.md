# Mini-Walmart Order Processing System

A microservices-based order processing system that demonstrates event-driven architecture using AWS services (SNS/SQS) and LocalStack for local development.

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

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mini-walmart.git
   cd mini-walmart
   ```

2. **Start LocalStack**
   ```bash
   docker-compose up -d
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

Each service includes unit tests and integration tests. To run tests:

### Orders Service
```bash
cd orders
go test ./...
```

### Notifications Service
```bash
cd notifications
npm test
```

## Infrastructure

The project uses LocalStack to emulate AWS services locally:
- SNS Topic for order events
- SQS Queue subscribed to the SNS topic
- (Optional) Terraform configurations in `/infra`

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Submit a pull request to `dev`

## License

MIT
