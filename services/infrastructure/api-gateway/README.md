# API Gateway Service

Unified API gateway for the trading system.

## Overview

The API Gateway provides:
- Single entry point for all client requests
- Authentication and authorization
- Request routing to microservices
- Rate limiting and throttling
- API versioning
- Request/response transformation
- WebSocket support for real-time data

## Features

- JWT-based authentication
- Role-based access control (RBAC)
- GraphQL and REST API support
- WebSocket for real-time updates
- Request validation
- Response caching
- API documentation (OpenAPI/Swagger)
- Cross-origin resource sharing (CORS)

## Technology Stack

- **Language**: Go 1.21+ (for performance)
- **Framework**: Gin or Echo
- **Key Libraries**:
  - `gin-gonic/gin`: Web framework
  - `graphql-go`: GraphQL support
  - `gorilla/websocket`: WebSocket
  - `go-redis`: Caching
  - `casbin`: Authorization

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - User logout

### Trading APIs
- `/api/v1/accounts/*` → Manager Service
- `/api/v1/strategies/*` → Strategy Service
- `/api/v1/orders/*` → Execution Service
- `/api/v1/risk/*` → Risk Service
- `/api/v1/market/*` → Data Services

### WebSocket
- `WS /ws/market` - Real-time market data
- `WS /ws/orders` - Order updates
- `WS /ws/positions` - Position updates

### GraphQL
- `POST /graphql` - GraphQL endpoint

### Admin
- `GET /admin/health` - Health check
- `GET /admin/metrics` - Prometheus metrics
- `GET /admin/config` - Configuration

## Authentication Flow

1. User sends credentials to `/auth/login`
2. Gateway validates and issues JWT token
3. Client includes token in Authorization header
4. Gateway validates token on each request
5. Routes request to appropriate service

## Rate Limiting

Default limits:
- Anonymous: 100 requests/minute
- Authenticated: 1000 requests/minute
- WebSocket: 100 messages/second

## Configuration

Environment variables:
- `PORT` - Gateway port (default: 8000)
- `JWT_SECRET` - JWT signing secret
- `REDIS_URL` - Redis for caching
- `SERVICE_URLS` - Backend service URLs
- `RATE_LIMIT` - Rate limit config
- `LOG_LEVEL` - Logging level

## Security Features

- TLS/SSL termination
- Request sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Security headers
- IP whitelisting (optional)