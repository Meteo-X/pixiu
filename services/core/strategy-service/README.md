# Strategy Service

Trading strategy execution engine for the trading system.

## Overview

The Strategy Service is a stateless service responsible for:
- Strategy registration and lifecycle management
- Processing market data and generating trading signals
- Technical indicator calculations
- Strategy backtesting
- Performance tracking and metrics

## Features

- Pluggable strategy architecture
- Built-in technical indicators library
- Real-time signal generation
- Historical backtesting framework
- Strategy parameter optimization
- Performance analytics
- Multi-strategy orchestration

## Technology Stack

- **Language**: Python 3.10+
- **Framework**: FastAPI
- **Key Libraries**:
  - `pandas`: Data manipulation
  - `numpy`: Numerical computations
  - `ta-lib`: Technical indicators
  - `google-cloud-pubsub`: Event streaming
  - `asyncio`: Async processing

## API Endpoints

### Strategy Management
- `GET /api/v1/strategies` - List all strategies
- `POST /api/v1/strategies` - Register new strategy
- `GET /api/v1/strategies/{id}` - Get strategy details
- `PUT /api/v1/strategies/{id}` - Update strategy
- `DELETE /api/v1/strategies/{id}` - Remove strategy
- `POST /api/v1/strategies/{id}/start` - Start strategy
- `POST /api/v1/strategies/{id}/stop` - Stop strategy

### Backtesting
- `POST /api/v1/backtest` - Run backtest
- `GET /api/v1/backtest/{id}` - Get backtest results
- `POST /api/v1/optimize` - Run parameter optimization

### Metrics
- `GET /api/v1/metrics` - Get all strategy metrics
- `GET /api/v1/metrics/{strategy_id}` - Get strategy metrics

## Strategy Framework

Base strategy interface:
```python
class BaseStrategy:
    async def on_market_data(self, data: MarketData) -> Optional[Signal]
    async def on_kline(self, kline: KlineData) -> Optional[Signal]
    async def on_order_update(self, order: Order) -> None
```

## Built-in Strategies

- `MACrossStrategy` - Moving average crossover
- `RSIMeanReversionStrategy` - RSI-based mean reversion
- `BreakoutStrategy` - Price breakout detection
- `GridTradingStrategy` - Grid trading bot

## Signal Format

Generated signals published to Google Cloud Pub/Sub topic: `signals-{strategy_id}-{action}`

```json
{
  "strategy_id": "ma_cross_btc",
  "timestamp": 1234567890000,
  "exchange": "binance",
  "symbol": "BTC/USDT",
  "action": "buy",
  "quantity": 0.1,
  "price": 50000.0,
  "confidence": 0.85,
  "metadata": {
    "indicator_values": {...}
  }
}
```

## Configuration

Environment variables:
- `GOOGLE_CLOUD_PROJECT` - Google Cloud project ID
- `PUBSUB_EMULATOR_HOST` - Pub/Sub emulator endpoint (for development)
- `MANAGER_SERVICE_URL` - Manager service URL
- `REDIS_URL` - Redis for caching
- `MAX_STRATEGIES` - Max concurrent strategies
- `LOG_LEVEL` - Logging level