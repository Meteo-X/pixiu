# Risk Service

Risk management and control service for the trading system.

## Overview

The Risk Service is a stateless service responsible for:
- Pre-trade risk validation
- Real-time position and exposure monitoring
- Risk limit enforcement
- Stop-loss and take-profit management
- Drawdown protection
- Compliance checks

## Features

- Rule-based risk engine
- Real-time risk metrics calculation
- Multi-level risk limits
- Position size validation
- Exposure monitoring
- Automated risk actions
- Alert generation
- Risk reporting

## Technology Stack

- **Language**: Python 3.10+
- **Framework**: FastAPI
- **Key Libraries**:
  - `aiokafka`: Event streaming
  - `redis`: State caching
  - `numpy`: Risk calculations
  - `pydantic`: Data validation

## API Endpoints

### Risk Rules
- `GET /api/v1/rules` - List all risk rules
- `POST /api/v1/rules` - Create new rule
- `GET /api/v1/rules/{id}` - Get rule details
- `PUT /api/v1/rules/{id}` - Update rule
- `DELETE /api/v1/rules/{id}` - Delete rule
- `POST /api/v1/rules/{id}/enable` - Enable rule
- `POST /api/v1/rules/{id}/disable` - Disable rule

### Risk Checks
- `POST /api/v1/check/pre-trade` - Pre-trade validation
- `GET /api/v1/check/limits` - Check current limits

### Risk Metrics
- `GET /api/v1/metrics` - Get all risk metrics
- `GET /api/v1/metrics/{metric}` - Get specific metric
- `GET /api/v1/exposure` - Get current exposure

### Alerts
- `GET /api/v1/alerts` - Get active alerts
- `POST /api/v1/alerts/acknowledge` - Acknowledge alert

## Risk Rules

Built-in rule types:
- `PositionLimitRule` - Max position per asset
- `ExposureLimitRule` - Total exposure limit
- `DrawdownRule` - Max drawdown protection
- `ConcentrationRule` - Position concentration
- `VelocityRule` - Trade frequency limits
- `TimeBasedRule` - Time-based restrictions

## Risk Events

Published to Kafka topics:
- `risk.alert.{level}` - Risk alerts
- `risk.violation.{rule}` - Rule violations
- `risk.action.{type}` - Automated actions

## Configuration

Environment variables:
- `KAFKA_BROKER` - Kafka broker
- `REDIS_URL` - Redis connection
- `MANAGER_SERVICE_URL` - Manager service
- `MAX_DRAWDOWN` - Default max drawdown
- `DEFAULT_POSITION_LIMIT` - Default position limit
- `LOG_LEVEL` - Logging level

## Risk Metrics

Key metrics monitored:
- Value at Risk (VaR)
- Maximum Drawdown
- Sharpe Ratio
- Position Concentration
- Leverage Ratio
- Win/Loss Ratio