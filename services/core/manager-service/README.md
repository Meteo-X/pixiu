# Manager Service

Central state management service for the trading system.

## Overview

The Manager Service is the only stateful service in the system, responsible for:
- API key management and encryption
- Account balance tracking
- Position management
- Fund allocation across strategies
- Strategy quota control
- System-wide state coordination

## Features

- Secure API key storage with encryption
- Real-time balance and position tracking
- Fund allocation management
- Strategy quota enforcement
- State persistence and recovery
- Event sourcing for audit trail
- High availability with leader election

## Technology Stack

- **Language**: Python 3.10+
- **Framework**: FastAPI
- **Database**: PostgreSQL + Redis
- **Key Libraries**:
  - `sqlalchemy`: ORM
  - `alembic`: Database migrations
  - `cryptography`: API key encryption
  - `google-cloud-pubsub`: Event streaming

## API Endpoints

### Account Management
- `GET /api/v1/accounts` - List all accounts
- `POST /api/v1/accounts` - Create new account
- `GET /api/v1/accounts/{id}` - Get account details
- `PUT /api/v1/accounts/{id}` - Update account
- `DELETE /api/v1/accounts/{id}` - Delete account

### Balance & Position
- `GET /api/v1/balances` - Get all balances
- `GET /api/v1/positions` - Get all positions
- `POST /api/v1/positions/update` - Update positions

### Fund Management
- `GET /api/v1/allocations` - Get fund allocations
- `POST /api/v1/allocations` - Allocate funds to strategy
- `PUT /api/v1/allocations/{id}` - Update allocation
- `DELETE /api/v1/allocations/{id}` - Remove allocation

### Strategy Quotas
- `GET /api/v1/quotas` - Get all quotas
- `POST /api/v1/quotas` - Set strategy quota
- `GET /api/v1/quotas/{strategy_id}` - Get strategy quota
- `PUT /api/v1/quotas/{strategy_id}` - Update quota

## Database Schema

Key tables:
- `accounts` - Exchange account credentials
- `balances` - Current asset balances
- `positions` - Open positions
- `allocations` - Strategy fund allocations
- `quotas` - Strategy trading quotas
- `audit_log` - All state changes

## Security

- API keys encrypted at rest using AES-256
- Master key rotation support
- Role-based access control
- Audit logging for all operations
- Secure communication via TLS

## Configuration

Environment variables:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `ENCRYPTION_KEY` - Master encryption key
- `GOOGLE_CLOUD_PROJECT` - Google Cloud project ID
- `PUBSUB_EMULATOR_HOST` - Pub/Sub emulator endpoint (for development)
- `LOG_LEVEL` - Logging level