# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pixiu is a cryptocurrency quantitative trading system built with microservice architecture. The system follows an event-driven design pattern using Google Cloud Pub/Sub for service communication and supports multiple exchanges (CEX and DEX).

## Architecture

The system uses a layered microservice architecture:
- **Data Collection Layer**: Exchange/blockchain/auxiliary data collectors
- **Message Bus**: Google Cloud Pub/Sub for event streaming (with configurable alternatives)
- **Core Services**: Manager (stateful), Strategy, Risk, and Execution services  
- **Exchange Adapters**: Unified trading interfaces for different exchanges
- **Storage Layer**: PostgreSQL, TimescaleDB, Redis

The Manager service is the only stateful service and handles centralized state management including API keys, balances, positions, and fund allocation.

## Development Commands

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

### Service-Specific Commands

#### Python Services (Manager, Strategy, Risk, Execution, Auxiliary Collector)
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

#### TypeScript/Node.js Services (Exchange Collector)  
```bash
cd services/data-collection/exchange-collector

# Install dependencies
npm install

# Development commands
npm run dev        # development with auto-reload
npm run build      # compile TypeScript
npm run start      # start compiled service
npm run test       # run tests
npm run test:watch # test in watch mode
npm run lint       # ESLint
npm run format     # Prettier formatting
npm run type-check # TypeScript type checking
```

#### Go Services (API Gateway, Blockchain Collector)
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

- **Python Services**: FastAPI, SQLAlchemy, Alembic (migrations), google-cloud-pubsub, asyncpg, Redis
- **TypeScript Services**: Express.js, ws (WebSocket), @google-cloud/pubsub, winston (logging)
- **Go Services**: Gin (HTTP), gorilla/websocket, Google Cloud Pub/Sub Go client
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

## Key Directories

- `services/core/`: Core business services (Manager, Strategy, Risk, Execution)
- `services/data-collection/`: Data ingestion services  
- `services/adapters/`: Exchange trading adapters
- `services/infrastructure/`: Infrastructure services (API Gateway, Config)
- `deployment/`: Docker Compose and Kubernetes configurations
- `docs/`: Architecture and API documentation
- `experiments/`: Research and experimental code

## Configuration

Services use environment variables for configuration. Key variables:
- Database connections: `DATABASE_URL`, `REDIS_URL`
- Google Cloud: `GOOGLE_CLOUD_PROJECT`, `PUBSUB_EMULATOR_HOST` (for development)
- Service URLs: `MANAGER_URL`, etc.
- Log levels: `LOG_LEVEL`

Development configurations are in `deployment/docker-compose/.env` files.

## Testing Strategy

- **Unit Tests**: `pytest` for Python, `jest` for TypeScript, `go test` for Go
- **Integration Tests**: Use testcontainers for database/Pub/Sub integration
- **Coverage Requirements**: ≥80% for unit tests, ≥60% for integration tests
- **Test Data**: Use factory patterns for consistent test data generation

## Common Patterns

- Services communicate via Google Cloud Pub/Sub topics following naming convention: `{domain}-{type}-{source}`
- All services expose health endpoints at `/health`
- Metrics exposed at `/metrics` for Prometheus scraping, and integrated with Google Cloud Monitoring
- Structured logging using appropriate libraries per language, with Google Cloud Logging integration
- Error handling with proper error types and status codes
- Configuration validation on service startup