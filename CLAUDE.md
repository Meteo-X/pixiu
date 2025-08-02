# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT

All the documents MUST be written in Simplified Chinese, except some domain terms or code fragements.

All the diagrams in documents MUST be written in `mermaid` syntax.

## Project Overview

Pixiu is a cryptocurrency quantitative trading system built with microservice architecture. The system follows an event-driven design pattern using Google Cloud Pub/Sub for service communication and supports multiple exchanges (CEX and DEX).

## Architecture

The system uses a layered microservice architecture with npm workspaces for TypeScript components:

```mermaid
graph TB
    subgraph "Infrastructure Layer"
        SC[shared-core<br/>配置管理、错误处理、监控、消息总线]
        AB[adapter-base<br/>适配器基础框架]
    end
    
    subgraph "Adapter Layer"
        BA[binance-adapter<br/>Binance交易所适配器SDK]
    end
    
    subgraph "Service Layer"
        EC[exchange-collector<br/>数据采集服务]
        MS[manager-service<br/>核心管理服务]
        SS[strategy-service<br/>策略服务]
        RS[risk-service<br/>风险管理服务]
        ES[execution-service<br/>执行服务]
    end
    
    subgraph "Data Collection"
        BC[blockchain-collector<br/>区块链数据采集]
        AC[auxiliary-collector<br/>辅助数据采集]
    end
    
    SC --> AB
    AB --> BA
    BA --> EC
    SC --> EC
    SC --> MS
    SC --> SS
    SC --> RS
    SC --> ES
```

### Key Architecture Principles:
- **Infrastructure-First**: Shared components in `services/infrastructure/` provide common functionality
- **Adapter Pattern**: Exchange adapters are SDKs integrated into exchange-collector, not standalone services
- **Event-Driven**: Services communicate via Google Cloud Pub/Sub with configurable alternatives
- **Stateful Core**: Manager service is the only stateful service handling centralized state management
- **Configuration-Driven**: Adapter activation and configuration managed through environment-specific files

## Development Commands

### Workspace Management (Root Level)
```bash
# Install all workspace dependencies
npm install

# Run all tests
npm test

# Run tests by category
npm run test:infrastructure  # shared-core, adapter-base
npm run test:adapters        # binance-adapter
npm run test:services        # exchange-collector

# Run tests with coverage
npm run test:coverage

# Watch mode for all tests
npm run test:watch

# Build all TypeScript packages
npm run build

# Build by category  
npm run build:infrastructure
npm run build:adapters
npm run build:services

# Lint all packages
npm run lint

# Format all packages
npm run format

# Clean all build artifacts
npm run clean
```

### Working with Individual Packages
```bash
# Test specific package
npm run test -w @pixiu/shared-core
npm run test -w @pixiu/binance-adapter

# Run single test file
cd services/infrastructure/shared-core
npm test -- tests/config.test.ts

# Development with auto-rebuild
npm run dev -w @pixiu/exchange-collector
```

### Docker Development Environment
```bash
# Start minimal development environment (databases + Pub/Sub emulator)
cd deployment/docker-compose
docker-compose -f docker-compose.dev.yml up -d

# Verify services are running
docker-compose -f docker-compose.dev.yml ps

# Start full environment with monitoring
docker-compose up -d

# Stop development environment
docker-compose -f docker-compose.dev.yml down
```

### Python Services (Manager, Strategy, Risk, Execution, Auxiliary Collector)
```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest
pytest --coverage  # with coverage
pytest -k "test_name"  # specific test

# Code quality checks
black .  # format code
isort .  # sort imports  
mypy .   # type checking
flake8 . # linting

# Start service (example for manager-service)
cd services/core/manager-service
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Go Services (API Gateway, Blockchain Collector)
```bash
# Install dependencies
go mod download

# Build and run
go build -o bin/service ./cmd/main.go
./bin/service

# Run tests
go test ./...
go test -v ./...  # verbose
go test -cover ./...  # with coverage

# Development with auto-reload (install air first: go install github.com/cosmtrek/air@latest)
air
```

## Technology Stack by Service

### TypeScript/Node.js Components (npm workspaces)
- **shared-core**: Configuration management, error handling, monitoring, Pub/Sub client, caching utilities
- **adapter-base**: Base classes and interfaces for exchange adapters, connection management
- **binance-adapter**: Binance exchange adapter SDK with WebSocket support and data parsing
- **exchange-collector**: Data collection service that integrates multiple exchange adapters

### Python Services (FastAPI-based)
- **manager-service**: Core stateful service - API keys, balances, positions, fund allocation
- **strategy-service**: Trading strategy execution and portfolio management  
- **risk-service**: Risk management, position sizing, and compliance checks
- **execution-service**: Order execution and trade management
- **auxiliary-collector**: Alternative data collection (news, social sentiment, etc.)

### Go Services (High-performance)
- **api-gateway**: External API gateway with authentication and rate limiting
- **blockchain-collector**: On-chain data collection from various blockchain networks

### Infrastructure
- **Databases**: PostgreSQL (business data), TimescaleDB (time series), Redis (cache/state)
- **Message Bus**: Google Cloud Pub/Sub (with configurable alternatives)
- **Monitoring**: Google Cloud Monitoring, Prometheus, Grafana

## Database Management

### PostgreSQL/TimescaleDB
```bash
# Connect to development database
psql postgresql://trading:trading123@localhost:5432/trading_db

# Connect to TimescaleDB  
psql postgresql://tsdb:tsdb123@localhost:5433/market_data

# Run migrations (for manager-service)
cd services/core/manager-service
alembic upgrade head
alembic revision --autogenerate -m "description"
```

### Redis
```bash
# Connect to Redis
redis-cli -h localhost -p 6379
```

## Project Structure

### NPM Workspace Organization
```
services/
├── infrastructure/          # Shared TypeScript packages
│   ├── shared-core/        # @pixiu/shared-core - Core utilities
│   └── adapter-base/       # @pixiu/adapter-base - Adapter framework
├── adapters/               # Exchange adapter SDKs
│   └── binance-adapter/    # @pixiu/binance-adapter - Binance SDK
├── data-collection/        # Data collection services
│   ├── exchange-collector/ # @pixiu/exchange-collector - Main collector
│   ├── blockchain-collector/ # Go-based blockchain data collector
│   └── auxiliary-collector/  # Python-based auxiliary data collector
├── core/                   # Core business services (Python)
│   ├── manager-service/    # Stateful core service
│   ├── strategy-service/   # Strategy execution
│   ├── risk-service/       # Risk management
│   └── execution-service/  # Order execution
└── infrastructure/
    └── api-gateway/        # Go-based API gateway
```

### Test Organization
Each package contains its own tests in a `tests/` directory alongside `src/`. This follows standard practices where unit tests are co-located with the implementation code they test.

## Configuration

Services use environment variables for configuration. Key variables:
- Database connections: `DATABASE_URL`, `REDIS_URL`
- Google Cloud: `GOOGLE_CLOUD_PROJECT`, `PUBSUB_EMULATOR_HOST` (for development)
- Service URLs: `MANAGER_URL`, etc.
- Log levels: `LOG_LEVEL`

Development configurations are in `deployment/docker-compose/.env` files.

## Testing Strategy

### Test Framework by Language
- **TypeScript**: Jest with project-specific configurations and shared test utilities
- **Python**: pytest with coverage reporting and testcontainers for integration
- **Go**: Built-in `go test` with coverage and verbose modes

### Test Structure and Execution
- Tests are located in each package's `tests/` directory alongside `src/`
- Root-level workspace commands run tests across all packages with aggregated reporting
- Test files include proper cleanup to prevent Jest hanging (global cache cleanup)
- Mock implementations used for cross-package dependencies during testing

### Important Test Notes
- All test files that import from `@pixiu/shared-core` must include `globalCache.destroy()` in `afterAll()` to prevent Jest from hanging
- Use `--passWithNoTests` flag for packages without tests to avoid build failures
- TypeScript mock compatibility requires `as any` type assertions for complex interface mocking

## Common Patterns

### Service Communication
- Services communicate via Google Cloud Pub/Sub topics following naming convention: `{domain}-{type}-{source}`
- Infrastructure packages provide unified message bus abstraction with configurable backends

### Monitoring and Health
- All services expose health endpoints at `/health`  
- Metrics exposed at `/metrics` for Prometheus scraping, integrated with Google Cloud Monitoring
- Structured logging using appropriate libraries per language, with Google Cloud Logging integration

### Error Handling
- Centralized error handling through `@pixiu/shared-core` BaseErrorHandler
- Proper error categorization with recovery strategies (retry, escalate, ignore)
- Circuit breaker patterns for external service interactions

### Adapter Pattern Implementation
- Exchange adapters inherit from BaseAdapter in `@pixiu/adapter-base`
- Adapters are SDKs integrated into exchange-collector, not standalone services
- Configuration-driven adapter activation through service config files
- Event-driven architecture with status change notifications and data streaming