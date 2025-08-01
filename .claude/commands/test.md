# /test - Task Acceptance Testing Command

This command performs comprehensive acceptance testing for specific implementation tasks by generating automated test suites for real-world validation and regression testing.

## Usage
```
/test <task_file> <task_number>
```

## Parameters
- `task_file`: Path to the task document (e.g., `services/data-collection/exchange-collector/docs/implementation-plan.md`)
- `task_number`: Task identifier to test (e.g., `1.2.1`, `2.1`, etc.)

## Examples
```
/test services/data-collection/exchange-collector/docs/implementation-plan.md 2.1
/test implementation-plan.md 1.2
/test docs/tasks.md 3.1.2
```

## What it does
1. **Task Analysis**: Parses task requirements and acceptance criteria from documentation
2. **Test Strategy**: Determines testing approaches based on task type and implementation
3. **Test Suite Generation**: Creates comprehensive automated test suites with real test code
4. **Acceptance Testing**: Generates executable tests that validate requirements
5. **Integration Testing**: Creates tests for component interactions and system behavior
6. **Regression Protection**: Produces tests that can be run continuously to prevent regressions
7. **Test Execution**: Runs generated tests and validates current implementation
8. **Report Generation**: Creates detailed test reports with execution results

## Core Philosophy: Test-Driven Validation

This command follows a **test-first validation approach**:
- **Real Test Code**: Generates actual executable test files, not just analysis reports
- **Automated Verification**: Tests can be run automatically in CI/CD pipelines
- **Regression Protection**: Test suites prevent future code changes from breaking functionality
- **Living Documentation**: Tests serve as executable specifications and documentation
- **Continuous Validation**: Tests can be run repeatedly to ensure ongoing compliance

## Testing Approach

### 1. Acceptance Test Generation
Creates comprehensive test suites that validate:
- **Functional Requirements**: All specified features work correctly
- **API Contracts**: Public interfaces behave as documented
- **Integration Points**: Components work together properly
- **Error Handling**: Edge cases and error conditions are handled correctly
- **Performance Criteria**: Response times and resource usage meet requirements
- **Security Requirements**: Sensitive data handling and access controls work properly

### 2. Test Suite Structure
Generates organized test files:
```
acceptance-tests/
├── task-<number>-<name>/
│   ├── acceptance.test.ts        # Main acceptance test suite
│   ├── integration.test.ts       # Component integration tests
│   ├── scenarios.test.ts         # Real-world usage scenarios
│   ├── regression.test.ts        # Regression prevention tests
│   ├── performance.test.ts       # Performance validation tests
│   ├── security.test.ts          # Security requirement tests
│   ├── fixtures/                 # Test data and mocks
│   │   ├── config-samples/
│   │   ├── mock-data/
│   │   └── test-helpers/
│   └── README.md                 # Test suite documentation
```

### 3. Test Types Generated

#### Functional Tests
- Unit tests for individual components
- Integration tests for component interactions
- End-to-end tests for complete workflows
- API contract tests for public interfaces

#### Quality Assurance Tests
- Type safety verification
- Code quality checks
- Documentation completeness
- Error handling validation

#### Non-Functional Tests
- Performance benchmarks
- Security vulnerability tests
- Compatibility tests across environments
- Resource usage validation

#### Regression Tests
- Interface stability tests
- Behavior consistency tests
- Configuration compatibility tests
- Backward compatibility validation

## Sub-agents Used

### Primary Agent: acceptance-tester
Specialized for generating comprehensive test suites:
- Analyzes task requirements and creates test specifications
- Generates executable test code for all scenarios
- Creates test fixtures and mock data
- Produces test documentation and setup instructions
- Validates test coverage against requirements

### Supporting Agents (when needed):
- **typescript-developer**: For TypeScript-specific test patterns and type safety
- **general-purpose**: For complex analysis and documentation generation

## Output Structure

### Generated Test Files
```
acceptance-tests/
├── task-<number>-<name>/
│   ├── tests/
│   │   ├── acceptance/
│   │   │   ├── requirements.test.ts
│   │   │   ├── api-contracts.test.ts
│   │   │   └── user-scenarios.test.ts
│   │   ├── integration/
│   │   │   ├── component-integration.test.ts
│   │   │   ├── system-integration.test.ts
│   │   │   └── environment-validation.test.ts
│   │   ├── regression/
│   │   │   ├── interface-stability.test.ts
│   │   │   ├── behavior-consistency.test.ts
│   │   │   └── compatibility.test.ts
│   │   └── performance/
│   │       ├── load-tests.test.ts
│   │       ├── memory-usage.test.ts
│   │       └── response-time.test.ts
│   ├── fixtures/
│   │   ├── test-data/
│   │   ├── mock-services/
│   │   ├── config-samples/
│   │   └── helpers/
│   ├── reports/
│   │   ├── test-execution-report.md
│   │   ├── coverage-report.html
│   │   └── test-results.json
│   ├── package.json              # Test-specific dependencies
│   ├── jest.config.js            # Test framework configuration
│   ├── setup.ts                  # Test environment setup
│   └── README.md                 # Test suite documentation
```

### Test Execution Reports
After generating and running tests:
```
test-reports/
├── YYYY-MM-DD/
│   └── task-<number>-<timestamp>/
│       ├── execution-summary.md
│       ├── test-results.json
│       ├── coverage-report.html
│       ├── performance-metrics.json
│       └── recommendations.md
```

## Test Generation Process

### 1. Requirement Analysis
- Parses task documentation for acceptance criteria
- Identifies functional and non-functional requirements
- Extracts API specifications and interface contracts
- Determines testing scope and priorities

### 2. Test Design
- Creates test scenarios based on requirements
- Designs test data and fixtures
- Plans integration test strategies
- Identifies performance and security test needs

### 3. Test Implementation
- Generates actual test code using appropriate frameworks
- Creates test helpers and utilities
- Implements mock services and test doubles
- Sets up test environments and configurations

### 4. Test Validation
- Runs generated tests against current implementation
- Validates test coverage against requirements
- Identifies gaps in test coverage
- Verifies test reliability and stability

### 5. Documentation & Integration
- Creates comprehensive test documentation
- Provides setup and execution instructions
- Integrates with existing CI/CD processes
- Creates maintenance guidelines

## Test Quality Standards

### Generated Tests Must:
- **Be Executable**: All tests can run without manual intervention
- **Be Maintainable**: Clear, well-documented, and easy to modify
- **Be Reliable**: Consistent results across environments and runs
- **Be Comprehensive**: Cover all requirements and edge cases
- **Be Fast**: Execute quickly for continuous integration
- **Be Independent**: Tests don't depend on external state or order

### Test Code Quality:
- Follow project coding standards
- Include clear test descriptions and documentation
- Use appropriate assertions and validation
- Handle async operations correctly
- Provide meaningful error messages
- Include proper setup and teardown

## Integration with Development Workflow

### Continuous Integration
- Tests can be run in CI/CD pipelines
- Automated test execution on code changes
- Integration with code coverage tools
- Performance regression detection

### Development Support
- Tests serve as living documentation
- Quick validation during development
- Regression detection during refactoring
- API contract validation

### Quality Assurance
- Automated acceptance criteria validation
- Consistent testing across environments
- Performance benchmarking
- Security validation

## Success Criteria

A task passes acceptance testing when:
- **All Generated Tests Pass**: Every test in the suite executes successfully
- **Requirements Coverage**: All acceptance criteria have corresponding tests
- **Integration Validation**: Component interactions work correctly
- **Performance Compliance**: Performance tests meet specified criteria
- **Security Validation**: Security tests pass without issues
- **Documentation Complete**: Test suite is well-documented and maintainable
- **Regression Protection**: Tests effectively prevent future regressions

## Task-Specific Test Patterns

### Configuration Systems
- Configuration loading and validation tests
- Environment-specific configuration tests
- Secret management integration tests
- Configuration error handling tests

### Connection Management
- WebSocket connectivity tests
- Heartbeat and keepalive mechanism tests
- Reconnection logic validation tests
- Connection pooling behavior tests

### Data Processing
- Data parsing and transformation tests
- Data validation and error handling tests
- Performance and throughput tests
- Data integrity and consistency tests

### API Integration
- External service communication tests
- Error handling and retry logic tests
- Authentication and authorization tests
- Rate limiting and throttling tests

## Implementation

The command will:
1. **Parse Task Requirements**: Extract acceptance criteria and specifications
2. **Analyze Current Implementation**: Understand codebase structure and patterns
3. **Generate Test Strategy**: Plan comprehensive testing approach
4. **Create Test Suites**: Generate executable test code for all scenarios
5. **Set Up Test Environment**: Create necessary fixtures and configurations
6. **Execute Test Validation**: Run tests against current implementation
7. **Generate Reports**: Create detailed results and recommendations
8. **Document Test Suite**: Provide clear instructions for ongoing use

ARGUMENTS: <task_file> <task_number>