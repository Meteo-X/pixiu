# Binance Adapter

High-performance Binance exchange adapter for real-time market data collection and publishing to Google Cloud Pub/Sub.

## Features

- **Real-time Data Collection**: WebSocket connections to Binance for trade, kline, and ticker data
- **Automatic Reconnection**: Robust reconnection mechanism with exponential backoff
- **Data Standardization**: Converts Binance-specific data formats to unified market data format
- **Google Cloud Integration**: Publishes data to Google Cloud Pub/Sub topics
- **High Performance**: Optimized for low latency and high throughput
- **Comprehensive Monitoring**: Built-in metrics and health monitoring

## Supported Data Types

- **Trade Data**: Real-time trade execution data
- **Kline Data**: Candlestick data with multiple time intervals (1m, 5m, 15m, 30m, 1h, 4h, 1d)
- **Ticker Data**: 24hr ticker price change statistics

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a configuration file `config/development.yaml`:

```yaml
binance:
  wsEndpoint: "wss://stream.binance.com:9443"
  symbols:
    - "BTC/USDT"
    - "ETH/USDT"
  dataTypes:
    - "trade"
    - "kline_1m"
    - "ticker"

googleCloud:
  projectId: "your-project-id"
  pubsub:
    topicPrefix: "market-data"
    publishSettings:
      batchSettings:
        maxMessages: 100
        maxLatency: 100
```

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Build project
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Binance API    │    │  Binance Adapter │    │ Google Cloud    │
│                 │────│                  │────│ Pub/Sub         │
│  WebSocket      │    │  Data Parser     │    │ Topic           │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Configuration

See [Configuration Guide](./docs/configuration.md) for detailed configuration options.

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## Development

See [Development Guide](./docs/development.md) for development setup and guidelines.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Deployment

See [Deployment Guide](./docs/deployment.md) for production deployment instructions.

## Monitoring

The adapter exposes Prometheus metrics at `/metrics` endpoint and integrates with Google Cloud Monitoring.

Key metrics:
- Connection status and uptime
- Message throughput and latency
- Error rates and types
- Data processing performance

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) file for details.