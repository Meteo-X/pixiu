# Pixiu - Crypto Auto-Trading System

A professional-grade cryptocurrency quantitative trading system built with microservice architecture, supporting multiple exchanges and trading strategies.

## 🏗️ Architecture Overview

Pixiu follows a microservice architecture pattern with event-driven communication through Apache Kafka. Each service is independently deployable and can be developed using different programming languages.

### System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Binance   │     │     OKX     │     │  Uniswap    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                    │
┌──────┴───────────────────┴────────────────────┴──────┐
│                  Data Collection Layer                │
├───────────────┬──────────────┬────────────────────────┤
│Exchange       │Blockchain    │Auxiliary               │
│Collector      │Collector     │Collector               │
└───────┬───────┴──────┬───────┴────────┬───────────────┘
        │              │                 │
┌───────┴──────────────┴─────────────────┴──────────────┐
│                    Kafka Message Bus                   │
│  Topics: market.*, signals.*, orders.*, risk.*        │
└───────┬──────────────┬─────────────────┬──────────────┘
        │              │                 │
┌───────┴───────┬──────┴───────┬────────┴───────────────┐
│Manager Service│Strategy      │Risk Service            │
│(Stateful)     │Service       │                        │
└───────────────┴──────┬───────┴────────┬───────────────┘
                       │                 │
                ┌──────┴───────┐ ┌───────┴───────┐
                │Execution     │ │API Gateway    │
                │Service       │ │               │
                └──────┬───────┘ └───────────────┘
                       │
        ┌──────────────┴────────────────┐
        │     Exchange Adapters         │
        │ Binance │ OKX │ DEX           │
        └───────────────────────────────┘
```

## 📁 Project Structure

```
pixiu/
├── services/
│   ├── data-collection/        # Data collection services
│   │   ├── exchange-collector/ # CEX market data (Python)
│   │   ├── blockchain-collector/ # On-chain data (Go)
│   │   └── auxiliary-collector/ # Supplementary data (Python)
│   ├── adapters/              # Exchange adapters
│   │   ├── binance-adapter/   # Binance integration
│   │   ├── okx-adapter/       # OKX integration
│   │   └── dex-adapter/       # DEX integration
│   ├── core/                  # Core business services
│   │   ├── manager-service/   # State management (Python)
│   │   ├── strategy-service/  # Strategy engine (Python)
│   │   ├── risk-service/      # Risk control (Python)
│   │   └── execution-service/ # Order execution (Python/Rust)
│   └── infrastructure/        # Infrastructure services
│       ├── api-gateway/       # API Gateway (Go)
│       └── config-service/    # Configuration management
├── deployment/                # Deployment configurations
│   ├── docker-compose/        # Docker Compose files
│   ├── kubernetes/            # K8s manifests
│   └── helm/                  # Helm charts
├── scripts/                   # Utility scripts
└── docs/                      # Documentation
    ├── api/                   # API documentation
    ├── architecture/          # Architecture docs
    └── deployment/            # Deployment guides
```

## 🚀 Key Features

- **Multi-Exchange Support**: Integrated with major CEX (Binance, OKX) and DEX platforms
- **Strategy Framework**: Pluggable architecture for custom trading strategies
- **Risk Management**: Real-time risk monitoring and control
- **High Performance**: Optimized for low-latency trading
- **Scalability**: Horizontal scaling support for all stateless services
- **Observability**: Complete monitoring stack with Prometheus, Grafana, and ELK

## 🛠️ Technology Stack

### Core Technologies
- **Message Bus**: Apache Kafka
- **Databases**: PostgreSQL, TimescaleDB, Redis
- **Languages**: Python, Go, Rust (flexible per service)
- **Container**: Docker, Kubernetes

### Monitoring & Operations
- **Metrics**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing**: Jaeger

## 🏃 Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pixiu.git
cd pixiu
```

2. Copy environment configuration:
```bash
cp deployment/docker-compose/.env.example deployment/docker-compose/.env
```

3. Start the development environment:
```bash
cd deployment/docker-compose
docker-compose -f docker-compose.dev.yml up -d
```

4. Verify services are running:
```bash
docker-compose -f docker-compose.dev.yml ps
```

### Full Environment Setup

For the complete environment with monitoring:
```bash
cd deployment/docker-compose
docker-compose up -d
```

Access points:
- API Gateway: http://localhost:8000
- Kafka UI: http://localhost:8080
- Grafana: http://localhost:3000 (admin/admin123)
- Kibana: http://localhost:5601

## 📊 Core Services

### Manager Service (Stateful)
Central state management including API keys, balances, positions, and fund allocation.

### Strategy Service
Trading strategy execution engine with built-in technical indicators and backtesting.

### Risk Service
Real-time risk monitoring and control with configurable risk rules.

### Execution Service
High-performance order routing and execution management.

### Data Collection Services
- **Exchange Collector**: Real-time market data from exchanges
- **Blockchain Collector**: On-chain data and DEX monitoring
- **Auxiliary Collector**: Funding rates, sentiment, and other data

## 🔒 Security

- API key encryption at rest
- TLS for all communications
- Role-based access control (RBAC)
- Audit logging for all operations

## 📈 Performance

- Designed for low-frequency trading (minute to daily timeframes)
- Sub-second order execution latency
- Supports 50+ concurrent strategies
- Handles 1000+ market data updates per second

## 🤝 Contributing

Please read our contributing guidelines before submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes only. Cryptocurrency trading involves substantial risk of loss. Always do your own research and trade responsibly.