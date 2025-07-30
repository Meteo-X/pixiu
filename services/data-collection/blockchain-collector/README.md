# Blockchain Collector Service

On-chain data collection service for blockchain networks and DEX monitoring.

## Overview

This service monitors blockchain networks and decentralized exchanges (DEX) to collect:
- Block and transaction data
- DEX swap events
- Liquidity pool updates
- Gas prices and network metrics
- Smart contract events

## Features

- Multi-chain support (Ethereum, BSC, Polygon, etc.)
- DEX event monitoring (Uniswap, PancakeSwap, etc.)
- Real-time event streaming
- Historical data backfilling
- Gas optimization tracking
- Event filtering and decoding

## Technology Stack

- **Language**: Go 1.21+ (for performance)
- **Key Libraries**:
  - `go-ethereum`: Ethereum client
  - `kafka-go`: Kafka producer
  - `prometheus`: Metrics

## API Endpoints

- `GET /health` - Health check
- `GET /status` - Service status and chain connections
- `GET /chains` - List of monitored chains
- `POST /contracts/add` - Add contract to monitor
- `DELETE /contracts/remove` - Remove contract monitoring

## Configuration

Environment variables:
- `KAFKA_BROKER` - Kafka broker address
- `CHAIN_RPCS` - JSON config of chain RPC endpoints
- `CONTRACTS` - Contracts to monitor
- `BLOCK_CONFIRMATIONS` - Blocks to wait before processing
- `LOG_LEVEL` - Logging level

## Message Format

Published to Kafka topic: `market.{chain}.{protocol}`

```json
{
  "chain": "ethereum",
  "protocol": "uniswap_v3",
  "event_type": "swap",
  "block_number": 18500000,
  "transaction_hash": "0x...",
  "timestamp": 1234567890,
  "data": {
    "pool": "0x...",
    "token0": "WETH",
    "token1": "USDC",
    "amount0": "1.5",
    "amount1": "3000.0",
    "price": 2000.0
  }
}
```