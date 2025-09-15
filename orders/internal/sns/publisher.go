package sns

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
)

// OrderEvent represents the SNS message format
type OrderEvent struct {
	EventType  string      `json:"eventType"`
	OrderID    string      `json:"orderId"`
	CustomerID string      `json:"customerId"`
	Items      []OrderItem `json:"items"`
}

type OrderItem struct {
	ProductID string  `json:"productId"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

// SNSPublisher interface for mocking in tests
type SNSPublisher interface {
	Publish(ctx context.Context, params *sns.PublishInput, optFns ...func(*sns.Options)) (*sns.PublishOutput, error)
}

type Publisher struct {
	client   SNSPublisher
	topicARN string
}

func NewPublisher() (*Publisher, error) {
	// Load AWS configuration
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		if endpoint := os.Getenv("AWS_ENDPOINT_URL"); endpoint != "" {
			return aws.Endpoint{
				PartitionID:   "aws",
				URL:           endpoint,
				SigningRegion: region,
			}, nil
		}
		return aws.Endpoint{}, &aws.EndpointNotFoundError{}
	})

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion("us-east-1"),
		config.WithEndpointResolverWithOptions(customResolver),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %v", err)
	}

	// Get SNS topic ARN from environment
	topicARN := os.Getenv("SNS_TOPIC_ARN")
	if topicARN == "" {
		return nil, fmt.Errorf("SNS_TOPIC_ARN environment variable is required")
	}

	return &Publisher{
		client:   sns.NewFromConfig(cfg),
		topicARN: topicARN,
	}, nil
}

func (p *Publisher) PublishOrderCreated(ctx context.Context, order OrderEvent) error {
	// Set the event type
	order.EventType = "OrderCreated"

	// Convert to JSON
	orderJSON, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("failed to marshal order event: %v", err)
	}

	input := &sns.PublishInput{
		Message:  aws.String(string(orderJSON)),
		TopicArn: aws.String(p.topicARN),
	}

	_, err = p.client.Publish(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to publish message: %v", err)
	}

	return nil
}
