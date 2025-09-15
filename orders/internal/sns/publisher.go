package sns

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sns"
)

type Publisher struct {
	client   *sns.Client
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

func (p *Publisher) PublishOrderCreated(ctx context.Context, orderJSON string) error {
	input := &sns.PublishInput{
		Message:  aws.String(orderJSON),
		TopicArn: aws.String(p.topicARN),
	}

	_, err := p.client.Publish(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to publish message: %v", err)
	}

	return nil
}
