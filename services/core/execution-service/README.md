# Execution Service

Order execution and routing service for the trading system.

## Overview

The Execution Service is a stateless, high-performance service responsible for:
- Order execution management
- Smart order routing
- Exchange adapter coordination
- Order lifecycle tracking
- Execution quality monitoring
- Retry and error handling

## Features

- Smart order routing across exchanges
- Multiple execution algorithms
- Order type support (Market, Limit, Stop, etc.)
- Slippage control
- Partial fill handling
- Order status synchronization
- Execution analytics
- Dead man's switch

## Technology Stack

- **Language**: Rust (for ultra-low latency)
- **Alternative**: Go or Python with Cython
- **Key Libraries**:
  - `tokio`: Async runtime
  - `google-cloud-pubsub`: Google Cloud Pub/Sub client
  - `redis`: State caching
  - `prometheus`: Metrics

## API Endpoints

### Order Management
- `POST /api/v1/orders` - Submit new order
- `GET /api/v1/orders/{id}` - Get order status
- `PUT /api/v1/orders/{id}` - Modify order
- `DELETE /api/v1/orders/{id}` - Cancel order
- `GET /api/v1/orders` - List orders

### Execution Control
- `POST /api/v1/execute` - Direct execution
- `GET /api/v1/routes` - Get available routes
- `POST /api/v1/routes/optimize` - Optimize routing

### Monitoring
- `GET /api/v1/metrics` - Execution metrics
- `GET /api/v1/health` - Service health
- `GET /api/v1/adapters` - Adapter status

## Execution Algorithms

- `DirectExecution` - Simple market/limit orders
- `TWAP` - Time-weighted average price
- `VWAP` - Volume-weighted average price
- `Iceberg` - Hidden quantity orders
- `SmartRouter` - Best execution routing

## Order Flow

1. Receive signal from Strategy Service
2. Validate with Risk Service
3. Route to optimal exchange
4. Submit via Exchange Adapter
5. Monitor execution status
6. Handle fills/rejections
7. Publish execution events

## Message Formats

### Input (from Risk Service)
```json
{
  "signal_id": "sig_123",
  "strategy_id": "ma_cross",
  "exchange": "binance",
  "symbol": "BTC/USDT",
  "side": "buy",
  "quantity": 0.1,
  "order_type": "limit",
  "price": 50000.0,
  "time_in_force": "GTC"
}
```

### Output (Order Events)
```json
{
  "order_id": "ord_456",
  "signal_id": "sig_123",
  "status": "filled",
  "filled_quantity": 0.1,
  "average_price": 50005.0,
  "commission": 0.05,
  "timestamp": 1234567890000
}
```

## Configuration

Environment variables:
- `GOOGLE_CLOUD_PROJECT` - Google Cloud project ID
- `PUBSUB_EMULATOR_HOST` - Pub/Sub emulator endpoint (for development)
- `REDIS_URL` - Redis connection
- `ADAPTER_ENDPOINTS` - Exchange adapters
- `MAX_RETRIES` - Order retry limit
- `EXECUTION_TIMEOUT` - Order timeout
- `LOG_LEVEL` - Logging level