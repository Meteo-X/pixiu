# Claude Code Sub Agents

This directory contains specialized sub agents for the Pixiu trading system development.

## Available Agents

### 1. Acceptance Tester (`acceptance-tester.md`)
**Purpose**: Performs comprehensive acceptance testing against real environments.

**Use Cases**:
- Verify Google Cloud Pub/Sub integration works correctly
- Test Binance WebSocket connections with real API
- Validate data flow end-to-end with actual services
- Performance testing under real load conditions
- Clean up test data after verification

**Example Usage**:
```
Use the acceptance-tester agent to verify that the Binance adapter can successfully:
1. Connect to Binance WebSocket API
2. Receive real market data
3. Parse and validate data format
4. Publish messages to Google Cloud Pub/Sub
5. Clean up any test topics created during testing
```

### 2. TypeScript Developer (`typescript-developer.md`)  
**Purpose**: Develops high-quality TypeScript code with 100% unit test coverage.

**Use Cases**:
- Implement new TypeScript modules and classes
- Create comprehensive unit test suites
- Refactor code for better type safety
- Design type-safe APIs and interfaces
- Optimize performance while maintaining type safety

**Example Usage**:
```
Use the typescript-developer agent to implement:
1. BinanceWebSocketConnector class with proper TypeScript types
2. Comprehensive unit tests with mocks for WebSocket and Pub/Sub
3. Error handling with typed error classes
4. Achieve 100% test coverage for all implemented code
```

## Agent Usage Pattern

### 1. Development Phase
Use the **typescript-developer** agent to:
- Implement features with proper TypeScript typing
- Create unit tests with 100% coverage
- Ensure code quality and maintainability

### 2. Verification Phase  
Use the **acceptance-tester** agent to:
- Test implementation against real services
- Verify acceptance criteria are met
- Validate performance requirements
- Clean up test data and environments

## Best Practices

### Development Workflow
1. **Plan**: Define requirements and acceptance criteria
2. **Develop**: Use typescript-developer agent for implementation
3. **Test**: Achieve 100% unit test coverage
4. **Verify**: Use acceptance-tester agent for end-to-end validation
5. **Deploy**: Once both unit and acceptance tests pass

### Code Quality Gates
- All TypeScript code must pass strict type checking
- Unit tests must achieve 100% coverage
- Acceptance tests must pass against real environments
- Performance requirements must be validated
- Test data must be properly cleaned up

## Integration with Task Management

These agents work seamlessly with the `/assign`, `/complete`, and `/status` commands:

```bash
# Assign development task
/assign implementation-plan.md 2.1

# Use typescript-developer agent for implementation
# Use acceptance-tester agent for verification

# Complete task after both development and testing pass
/complete implementation-plan.md 2.1
```

## Environment Requirements

### For TypeScript Developer
- Node.js and npm/yarn installed
- TypeScript compiler and type definitions
- Jest testing framework
- ESLint and Prettier for code quality

### For Acceptance Tester  
- Access to real Google Cloud project
- Valid API credentials for external services
- Network access to testing endpoints
- Permissions to create/delete test resources