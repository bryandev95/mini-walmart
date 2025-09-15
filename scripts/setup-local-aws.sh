#!/bin/bash

# AWS LocalStack configuration
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT="--endpoint-url=http://localhost:4566"

echo "Setting up AWS infrastructure in LocalStack..."

# Create SNS topic
echo "Creating SNS topic: orders-topic"
TOPIC_ARN=$(aws $AWS_ENDPOINT sns create-topic --name orders-topic --output json | jq -r '.TopicArn')
echo "Topic ARN: $TOPIC_ARN"

# Create DLQ for failed messages
echo "Creating DLQ: notifications-dlq"
DLQ_URL=$(aws $AWS_ENDPOINT sqs create-queue --queue-name notifications-dlq --output json | jq -r '.QueueUrl')
DLQ_ARN=$(aws $AWS_ENDPOINT sqs get-queue-attributes --queue-url $DLQ_URL --attribute-names QueueArn --output json | jq -r '.Attributes.QueueArn')
echo "DLQ URL: $DLQ_URL"
echo "DLQ ARN: $DLQ_ARN"

# Create main SQS queue with redrive policy
echo "Creating main queue: notifications-queue"
REDRIVE_POLICY="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":3}"
QUEUE_URL=$(aws $AWS_ENDPOINT sqs create-queue \
    --queue-name notifications-queue \
    --attributes "{\"RedrivePolicy\":\"$REDRIVE_POLICY\"}" \
    --output json | jq -r '.QueueUrl')
QUEUE_ARN=$(aws $AWS_ENDPOINT sqs get-queue-attributes --queue-url $QUEUE_URL --attribute-names QueueArn --output json | jq -r '.Attributes.QueueArn')
echo "Queue URL: $QUEUE_URL"
echo "Queue ARN: $QUEUE_ARN"

# Set queue policy to allow SNS to send messages
QUEUE_POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowSNSPublish\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"$QUEUE_ARN\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"$TOPIC_ARN\"}}}]}"
aws $AWS_ENDPOINT sqs set-queue-attributes \
    --queue-url $QUEUE_URL \
    --attributes "{\"Policy\":\"$QUEUE_POLICY\"}"

# Subscribe SQS to SNS
echo "Creating subscription from SNS to SQS"
SUBSCRIPTION_ARN=$(aws $AWS_ENDPOINT sns subscribe \
    --topic-arn $TOPIC_ARN \
    --protocol sqs \
    --notification-endpoint $QUEUE_ARN \
    --output json | jq -r '.SubscriptionArn')
echo "Subscription ARN: $SUBSCRIPTION_ARN"

# Verify setup
echo -e "\nVerifying setup..."
echo "SNS Topics:"
aws $AWS_ENDPOINT sns list-topics
echo -e "\nSQS Queues:"
aws $AWS_ENDPOINT sqs list-queues
echo -e "\nSNS Subscriptions:"
aws $AWS_ENDPOINT sns list-subscriptions

# Save ARNs for application use
echo -e "\nSaving configuration..."
cat > .env.local << EOF
SNS_TOPIC_ARN=$TOPIC_ARN
SQS_QUEUE_URL=$QUEUE_URL
SQS_QUEUE_ARN=$QUEUE_ARN
SQS_DLQ_URL=$DLQ_URL
SQS_DLQ_ARN=$DLQ_ARN
EOF

echo "Setup complete! Environment variables saved to .env.local"
