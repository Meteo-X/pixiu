# Agent Usage Examples

## Example 1: Implementing Binance WebSocket Connector

### Step 1: Development (TypeScript Developer Agent)
```
Task: Use the typescript-developer agent to implement BinanceWebSocketConnector

Requirements:
- Create a WebSocket connection manager with proper TypeScript types
- Implement connection pooling and auto-reconnection
- Handle Binance-specific message formats
- Create comprehensive unit tests with 100% coverage
- Mock WebSocket and external dependencies

Expected Deliverables:
- src/connector/BinanceWebSocketConnector.ts
- tests/connector/BinanceWebSocketConnector.test.ts
- 100% unit test coverage report
- Zero TypeScript compilation errors
```

### Step 2: Verification (Acceptance Tester Agent)
```
Task: Use the acceptance-tester agent to verify BinanceWebSocketConnector

Requirements:
- Test connection to real Binance WebSocket API
- Verify message parsing with actual market data
- Test reconnection behavior with network interruptions
- Measure connection latency and throughput
- Clean up any test subscriptions

Expected Results:
- Successful connection to wss://stream.binance.com:9443
- Proper parsing of trade, kline, and ticker messages  
- Reconnection within 5 seconds on failure
- Latency < 100ms, throughput > 1000 msg/s
- No lingering test connections
```

## Example 2: Implementing Google Cloud Pub/Sub Publisher

### Step 1: Development (TypeScript Developer Agent)
```
Task: Use the typescript-developer agent to implement PubSubPublisher

Requirements:
- Create type-safe Google Cloud Pub/Sub publisher
- Implement batch publishing with compression
- Handle publishing failures with retry logic
- Create unit tests with mocked Pub/Sub client
- Achieve 100% test coverage

Expected Deliverables:
- src/pubsub/PubSubPublisher.ts
- src/types/PubSubTypes.ts
- tests/pubsub/PubSubPublisher.test.ts
- Mock implementations for @google-cloud/pubsub
```

### Step 2: Verification (Acceptance Tester Agent)
```
Task: Use the acceptance-tester agent to verify PubSubPublisher

Requirements:
- Test publishing to real Google Cloud Pub/Sub topics
- Verify message format and attributes
- Test batch publishing performance
- Validate retry logic with simulated failures
- Clean up test topics and subscriptions

Expected Results:
- Messages successfully published to test topics
- Proper JSON serialization and compression
- Batch size optimization (100+ messages/batch)
- Retry logic works within 30 seconds
- All test topics deleted after testing
```

## Example 3: End-to-End Data Pipeline Testing

### Combined Agent Usage
```
Task: Verify complete Binance to Pub/Sub data pipeline

Phase 1 - Development (typescript-developer):
- Implement MarketDataPipeline class
- Create integration between connector and publisher
- Add proper error handling and monitoring
- Unit test all components with mocks

Phase 2 - Verification (acceptance-tester): 
- Test complete data flow: Binance → Parser → Pub/Sub
- Verify data integrity and format consistency
- Test error recovery scenarios
- Measure end-to-end latency
- Clean up all test data and connections

Success Criteria:
- Data flows successfully from Binance to Pub/Sub
- Message format matches schema specifications
- End-to-end latency < 200ms
- Error recovery completes within 10 seconds
- No test data remains in production systems
```

## Agent Communication Pattern

### 1. Task Assignment
```
/assign implementation-plan.md 2.1
```

### 2. Development Phase
```
Use the typescript-developer agent to implement the WebSocket connection manager for Binance adapter. 

Requirements:
- Implement BinanceWebSocketConnector class
- Use strict TypeScript typing
- Create comprehensive unit tests
- Achieve 100% test coverage
- Mock external WebSocket dependencies

Deliverables:
- Source code with proper TypeScript types
- Unit tests with full coverage
- Documentation for public APIs
```

### 3. Testing Phase  
```
Use the acceptance-tester agent to verify the Binance WebSocket connector implementation.

Requirements:
- Test against real Binance WebSocket API
- Verify all message types (trade, kline, ticker)
- Test connection resilience and recovery
- Measure performance metrics
- Clean up test connections

Success Criteria:
- Successful connection to Binance API
- Proper message parsing and validation
- Performance meets SLA requirements
- No test artifacts left in system
```

### 4. Task Completion
```
/complete implementation-plan.md 2.1
```

## Quality Assurance Workflow

### For Each Feature Implementation:

1. **Planning**: Define clear acceptance criteria
2. **Development**: Use typescript-developer for implementation
   - Write type-safe code
   - Create comprehensive unit tests
   - Achieve 100% coverage
3. **Testing**: Use acceptance-tester for verification
   - Test against real systems
   - Validate acceptance criteria
   - Measure performance
   - Clean up test data
4. **Review**: Ensure all quality gates are met
5. **Completion**: Mark task as complete

This ensures every feature is both well-implemented and thoroughly verified before being considered complete.