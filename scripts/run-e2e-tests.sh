#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Running E2E tests..."
echo "===================="

# Ensure LocalStack is running
echo "Checking LocalStack..."
curl -s http://localhost:4566/health > /dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ LocalStack is not running. Start it with: docker-compose up -d${NC}"
    exit 1
fi
echo -e "${GREEN}✓ LocalStack is running${NC}"

# Set up AWS environment
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566

# Ensure infrastructure is set up
echo "Setting up infrastructure..."
./scripts/setup-local-aws.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Infrastructure setup failed${NC}"
    exit 1
fi

# Load environment variables from .env.local
if [ -f .env.local ]; then
    echo "Loading environment variables from .env.local"
    set -a
    source .env.local
    set +a
else
    echo -e "${RED}❌ .env.local file not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Infrastructure setup complete${NC}"

# Start Orders service in background
echo "Starting Orders service..."
cd orders
go run cmd/main.go > /dev/null 2>&1 &
ORDERS_PID=$!
cd ..
echo -e "${GREEN}✓ Orders service started${NC}"

# Wait for Orders service to be ready
sleep 2

# Run Go E2E tests
echo "Running Orders service E2E tests..."
cd orders
go test ./tests/e2e/... -v
GO_EXIT_CODE=$?
cd ..

if [ $GO_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Orders service E2E tests passed${NC}"
else
    echo -e "${RED}❌ Orders service E2E tests failed${NC}"
fi

# Install Node.js dependencies
echo "Installing Notifications service dependencies..."
cd notifications
npm install > /dev/null 2>&1
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Run Node.js E2E tests
echo "Running Notifications service E2E tests..."
npm run test:e2e
NODE_EXIT_CODE=$?
cd ..

if [ $NODE_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Notifications service E2E tests passed${NC}"
else
    echo -e "${RED}❌ Notifications service E2E tests failed${NC}"
fi

# Clean up
echo "Cleaning up..."
kill $ORDERS_PID 2>/dev/null
echo -e "${GREEN}✓ Cleanup complete${NC}"

# Print environment variables for debugging
echo "Environment variables:"
echo "SQS_QUEUE_URL: $SQS_QUEUE_URL"
echo "SQS_DLQ_URL: $SQS_DLQ_URL"
echo "SNS_TOPIC_ARN: $SNS_TOPIC_ARN"

# Exit with failure if any tests failed
if [ $GO_EXIT_CODE -ne 0 ] || [ $NODE_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All E2E tests passed!${NC}"