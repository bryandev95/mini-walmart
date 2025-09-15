package api

import (
	"net/http"

	"mini-walmart/orders/internal/sns"

	"github.com/gin-gonic/gin"
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

type Handler struct {
	publisher *sns.Publisher
}

func NewHandler(publisher *sns.Publisher) *Handler {
	return &Handler{
		publisher: publisher,
	}
}

func (h *Handler) CreateOrder(c *gin.Context) {
	var order Order
	if err := c.ShouldBindJSON(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create SNS event from order
	event := sns.OrderEvent{
		OrderID:    order.OrderID,
		CustomerID: order.CustomerID,
		Items:      make([]sns.OrderItem, len(order.Items)),
	}

	// Copy items to event
	for i, item := range order.Items {
		event.Items[i] = sns.OrderItem{
			ProductID: item.ProductID,
			Quantity:  item.Quantity,
			Price:     item.Price,
		}
	}

	// Publish to SNS
	if err := h.publisher.PublishOrderCreated(c.Request.Context(), event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process order"})
		return
	}

	c.JSON(http.StatusCreated, order)
}
