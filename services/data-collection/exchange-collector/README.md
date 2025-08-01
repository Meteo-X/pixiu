# Exchange Collector Service

Real-time market data collection service for centralized exchanges (CEX).

## Overview

This service connects to various cryptocurrency exchanges via WebSocket and REST APIs to collect real-time market data, including:
- Price tickers
- Order book data
- Trade executions
- Kline/Candlestick data

## Features

- Multi-exchange support (Binance, OKX, etc.)
- WebSocket connections for real-time data
- REST API fallback for historical data
- Data normalization to unified format
- Automatic reconnection and error handling
- Configurable data collection intervals
- Google Cloud Pub/Sub integration for data publishing

## Technology Stack

- **Language**: Python 3.10+ (asyncio-based)
- **Key Libraries**:
  - `aiohttp`: Async HTTP client
  - `websockets`: WebSocket client
  - `google-cloud-pubsub`: Google Cloud Pub/Sub producer
  - `pydantic`: Data validation

## API Endpoints

- `GET /health` - Health check
- `GET /status` - Service status and connected exchanges
- `POST /subscribe` - Subscribe to new symbols
- `DELETE /unsubscribe` - Unsubscribe from symbols

## Configuration

Environment variables:
- `GOOGLE_CLOUD_PROJECT` - Google Cloud project ID
- `PUBSUB_EMULATOR_HOST` - Pub/Sub emulator endpoint (for development)
- `EXCHANGES` - Comma-separated list of exchanges to connect
- `SYMBOLS` - Default symbols to collect
- `LOG_LEVEL` - Logging level

## Message Format

Published to Google Cloud Pub/Sub topic: `market-{exchange}-{symbol}`

```json
{
  "exchange": "binance",
  "symbol": "BTC/USDT",
  "timestamp": 1234567890123,
  "price": 50000.00,
  "bid": 49999.99,
  "ask": 50000.01,
  "volume_24h": 1234.56
}
```