package main

import (
	"log"
	"os"

	"mini-walmart/orders/api"
	"mini-walmart/orders/internal/sns"

	"github.com/gin-gonic/gin"
)

func main() {
	// Create SNS publisher
	publisher, err := sns.NewPublisher()
	if err != nil {
		log.Fatalf("Failed to create SNS publisher: %v", err)
	}

	// Create handler
	handler := api.NewHandler(publisher)

	// Create router
	router := gin.Default()

	// Routes
	router.POST("/orders", handler.CreateOrder)

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Start server
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
