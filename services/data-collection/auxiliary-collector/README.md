# Auxiliary Collector Service

Supplementary data collection service for funding rates, market indicators, and external data sources.

## Overview

This service collects auxiliary market data that complements the main trading data:
- Funding rates from perpetual futures
- Open interest data
- Market sentiment indicators
- Fear & Greed Index
- Social media metrics
- News sentiment analysis

## Features

- Multi-source data aggregation
- Scheduled data collection
- Data validation and cleaning
- Historical data backfilling
- Rate limiting and retry logic
- Caching for frequently accessed data

## Technology Stack

- **Language**: Python 3.10+
- **Key Libraries**:
  - `httpx`: Async HTTP client
  - `apscheduler`: Task scheduling
  - `aiokafka`: Kafka producer
  - `beautifulsoup4`: Web scraping

## API Endpoints

- `GET /health` - Health check
- `GET /status` - Service status and data sources
- `GET /metrics/{metric}` - Get specific metric data
- `POST /collect/trigger` - Manually trigger collection

## Configuration

Environment variables:
- `KAFKA_BROKER` - Kafka broker address
- `DATA_SOURCES` - JSON config of data sources
- `COLLECTION_INTERVAL` - Data collection interval
- `CACHE_TTL` - Cache time-to-live
- `LOG_LEVEL` - Logging level

## Message Format

Published to Kafka topic: `market.auxiliary.{data_type}`

```json
{
  "data_type": "funding_rate",
  "source": "binance",
  "timestamp": 1234567890000,
  "data": {
    "symbol": "BTCUSDT",
    "funding_rate": 0.0001,
    "next_funding_time": 1234567900000,
    "interval_hours": 8
  }
}
```