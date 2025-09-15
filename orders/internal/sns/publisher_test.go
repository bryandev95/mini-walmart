package sns

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sns"
)

// MockSNSClient implements SNSPublisher interface for testing
type MockSNSClient struct {
	publishFunc func(ctx context.Context, params *sns.PublishInput, optFns ...func(*sns.Options)) (*sns.PublishOutput, error)
}

func (m *MockSNSClient) Publish(ctx context.Context, params *sns.PublishInput, optFns ...func(*sns.Options)) (*sns.PublishOutput, error) {
	return m.publishFunc(ctx, params, optFns...)
}

func TestPublishOrderCreated(t *testing.T) {
	// Test order
	testOrder := OrderEvent{
		OrderID:    "order123",
		CustomerID: "cust456",
		Items: []OrderItem{
			{
				ProductID: "prod789",
				Quantity:  2,
				Price:     29.99,
			},
		},
	}

	// Expected message after publishing
	var capturedMessage string

	// Create mock client
	mockClient := &MockSNSClient{
		publishFunc: func(ctx context.Context, params *sns.PublishInput, optFns ...func(*sns.Options)) (*sns.PublishOutput, error) {
			capturedMessage = *params.Message
			return &sns.PublishOutput{
				MessageId: aws.String("test-message-id"),
			}, nil
		},
	}

	// Create publisher with mock client
	publisher := &Publisher{
		client:   mockClient,
		topicARN: "test-topic-arn",
	}

	// Publish order
	err := publisher.PublishOrderCreated(context.Background(), testOrder)
	if err != nil {
		t.Fatalf("Failed to publish order: %v", err)
	}

	// Verify message format
	var publishedEvent OrderEvent
	err = json.Unmarshal([]byte(capturedMessage), &publishedEvent)
	if err != nil {
		t.Fatalf("Failed to unmarshal published message: %v", err)
	}

	// Verify event type was set
	if publishedEvent.EventType != "OrderCreated" {
		t.Errorf("Expected EventType 'OrderCreated', got '%s'", publishedEvent.EventType)
	}

	// Verify order details were preserved
	if publishedEvent.OrderID != testOrder.OrderID {
		t.Errorf("Expected OrderID '%s', got '%s'", testOrder.OrderID, publishedEvent.OrderID)
	}

	if publishedEvent.CustomerID != testOrder.CustomerID {
		t.Errorf("Expected CustomerID '%s', got '%s'", testOrder.CustomerID, publishedEvent.CustomerID)
	}

	if len(publishedEvent.Items) != len(testOrder.Items) {
		t.Errorf("Expected %d items, got %d", len(testOrder.Items), len(publishedEvent.Items))
	}
}
