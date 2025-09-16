package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/stretchr/testify/assert"
)

type OrderItem struct {
	ProductID string  `json:"productId"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

type Order struct {
	OrderID    string      `json:"orderId"`
	CustomerID string      `json:"customerId"`
	Items      []OrderItem `json:"items"`
}

func setupSQSClient(t *testing.T) *sqs.Client {
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:           "http://localhost:4566",
			SigningRegion: region,
		}, nil
	})

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion("us-east-1"),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(aws.CredentialsProviderFunc(func(ctx context.Context) (aws.Credentials, error) {
			return aws.Credentials{
				AccessKeyID:     "test",
				SecretAccessKey: "test",
			}, nil
		})),
	)
	if err != nil {
		t.Fatalf("Failed to create AWS config: %v", err)
	}

	return sqs.NewFromConfig(cfg)
}

func TestOrderCreationE2E(t *testing.T) {
	// Get queue URL from environment
	queueURL := os.Getenv("SQS_QUEUE_URL")
	if queueURL == "" {
		t.Fatal("SQS_QUEUE_URL environment variable is required")
	}

	// Create test order
	order := Order{
		OrderID:    fmt.Sprintf("test-order-%d", time.Now().Unix()),
		CustomerID: "test-customer",
		Items: []OrderItem{
			{
				ProductID: "test-product",
				Quantity:  2,
				Price:     29.99,
			},
		},
	}

	// Convert order to JSON
	orderJSON, err := json.Marshal(order)
	if err != nil {
		t.Fatalf("Failed to marshal order: %v", err)
	}

	// Send order to API
	resp, err := http.Post(
		"http://localhost:8080/orders",
		"application/json",
		bytes.NewBuffer(orderJSON),
	)
	if err != nil {
		t.Fatalf("Failed to send order: %v", err)
	}
	defer resp.Body.Close()

	// Check response status
	assert.Equal(t, http.StatusCreated, resp.StatusCode, "Expected 201 status code")

	// Decode response
	var responseOrder Order
	err = json.NewDecoder(resp.Body).Decode(&responseOrder)
	if err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Verify response matches sent order
	assert.Equal(t, order.OrderID, responseOrder.OrderID)
	assert.Equal(t, order.CustomerID, responseOrder.CustomerID)
	assert.Equal(t, len(order.Items), len(responseOrder.Items))

	// Check SQS for message
	sqsClient := setupSQSClient(t)
	var message *sqs.ReceiveMessageOutput
	var receiveErr error

	// Poll for message with timeout
	timeout := time.After(5 * time.Second)
	tick := time.Tick(500 * time.Millisecond)

	for {
		select {
		case <-timeout:
			t.Fatal("Timeout waiting for message")
		case <-tick:
			message, receiveErr = sqsClient.ReceiveMessage(context.Background(), &sqs.ReceiveMessageInput{
				QueueUrl:            aws.String(queueURL),
				MaxNumberOfMessages: 1,
				WaitTimeSeconds:     1,
			})
			if receiveErr != nil {
				t.Fatalf("Failed to receive message: %v", receiveErr)
			}
			if len(message.Messages) > 0 {
				goto MessageReceived
			}
		}
	}

MessageReceived:
	assert.Equal(t, 1, len(message.Messages), "Expected 1 message")

	// Parse SNS message from SQS
	var snsMessage map[string]interface{}
	err = json.Unmarshal([]byte(*message.Messages[0].Body), &snsMessage)
	if err != nil {
		t.Fatalf("Failed to unmarshal SNS message: %v", err)
	}

	// Parse order from SNS message
	var receivedOrder Order
	err = json.Unmarshal([]byte(snsMessage["Message"].(string)), &receivedOrder)
	if err != nil {
		t.Fatalf("Failed to unmarshal order from SNS message: %v", err)
	}

	// Verify order in message matches sent order
	assert.Equal(t, order.OrderID, receivedOrder.OrderID)
	assert.Equal(t, order.CustomerID, receivedOrder.CustomerID)
	assert.Equal(t, len(order.Items), len(receivedOrder.Items))

	// Delete message
	_, err = sqsClient.DeleteMessage(context.Background(), &sqs.DeleteMessageInput{
		QueueUrl:      aws.String(queueURL),
		ReceiptHandle: message.Messages[0].ReceiptHandle,
	})
	if err != nil {
		t.Fatalf("Failed to delete message: %v", err)
	}
}
