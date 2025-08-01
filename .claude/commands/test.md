# /test - Task Acceptance Testing Command

This command performs comprehensive acceptance testing for specific implementation tasks using specialized sub-agents, focusing on integration testing and validation against requirements.

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
1. **Task Analysis**: Identifies the specific task and its requirements
2. **Test Strategy**: Determines appropriate testing approaches and tools
3. **Acceptance Testing**: Validates implementation against requirements using sub-agents
4. **Integration Validation**: Verifies component interactions and system behavior
5. **Report Generation**: Creates detailed test reports with findings and recommendations
6. **Documentation**: Saves results in organized test report directory structure

## Testing Scope
The command performs acceptance-focused testing:

### Code Quality Testing
- **Static Analysis**: Code quality, type safety, linting
- **Architecture Review**: Design patterns, modularity, maintainability
- **Security Scan**: Vulnerability detection, best practices
- **Performance Analysis**: Memory usage, CPU efficiency, bottlenecks

### Integration Testing
- **Component Integration**: Inter-component communication and data flow
- **System Integration**: End-to-end system behavior validation
- **API Testing**: Interface compliance and contract verification
- **Environment Testing**: Configuration and deployment validation

### Acceptance Testing
- **Requirements Verification**: All acceptance criteria met
- **User Story Validation**: Feature completeness against specifications
- **Edge Case Testing**: Boundary conditions and error handling
- **Compatibility Testing**: Environment and dependency compatibility
- **Real-world Scenarios**: Practical usage pattern validation

## Sub-agents Used
The command intelligently selects appropriate sub-agents based on task type:

- **acceptance-tester**: Primary testing agent for validation against requirements and real-world scenarios
- **typescript-developer**: For TypeScript/Node.js code quality, integration testing, and type safety
- **general-purpose**: For documentation review, configuration analysis, and general system validation

## Output Structure
Test reports are saved in the following directory structure:
```
test-reports/
├── YYYY-MM-DD/
│   ├── <task_number>-<timestamp>/
│   │   ├── test-report.md           # Main acceptance test report
│   │   ├── test-results.json        # Machine-readable results
│   │   ├── code-analysis/
│   │   │   ├── static-analysis.md
│   │   │   ├── security-scan.md
│   │   │   └── performance-analysis.md
│   │   ├── integration-tests/
│   │   │   ├── component-integration.md
│   │   │   ├── system-integration.md
│   │   │   ├── api-testing.md
│   │   │   └── environment-validation.md
│   │   ├── acceptance-validation/
│   │   │   ├── requirements-check.md
│   │   │   ├── user-story-validation.md
│   │   │   ├── acceptance-criteria.md
│   │   │   └── real-world-scenarios.md
│   │   └── recommendations/
│   │       ├── fixes-needed.md
│   │       ├── improvements.md
│   │       └── next-steps.md
```

## Test Report Contents
Each test report includes:

### Executive Summary
- Overall acceptance status (PASS/FAIL/PARTIAL)
- Critical issues found
- Integration test results
- Recommendations summary
- Test coverage assessment

### Detailed Results
- Integration test execution logs
- Code quality metrics
- Performance benchmarks
- Security findings
- System behavior validation

### Issue Tracking
- Categorized issues by severity (Critical/High/Medium/Low)
- Specific file locations and line numbers
- Suggested fixes and improvements
- Priority rankings for remediation

### Acceptance Validation
- Requirements traceability matrix
- User story completion status
- Acceptance criteria verification
- Feature completeness assessment
- Real-world usage scenario validation

## Implementation
The command will:
1. Parse the task document and extract task requirements and acceptance criteria
2. Analyze the implemented codebase to understand scope and architecture
3. Determine appropriate testing strategies based on task type and complexity
4. Launch specialized sub-agents for different validation aspects:
   - **acceptance-tester**: Validate against requirements and test real scenarios
   - **typescript-developer**: Verify code quality and integration points
   - **general-purpose**: Review documentation and configuration
5. Execute integration tests to verify component interactions
6. Validate system behavior against acceptance criteria
7. Aggregate results from all testing phases
8. Generate comprehensive reports with actionable insights
9. Create organized documentation for future reference and debugging

## Integration with Development Workflow
- **Pre-completion**: Validate implementation before marking task complete
- **Code Review**: Support code review process with detailed analysis
- **Integration Validation**: Ensure components work together correctly
- **Documentation**: Maintains testing history for project tracking
- **Debugging Support**: Provides detailed reports for issue resolution

## Success Criteria
A task passes acceptance testing when:
- All functional requirements are implemented and working
- Integration points function correctly
- Code quality meets project standards
- Security best practices are followed
- Performance requirements are satisfied
- Documentation is complete and accurate
- All acceptance criteria are verified
- Real-world usage scenarios work as expected
- System behaves correctly under various conditions

## Task-Specific Testing
The command adapts testing approach based on task type:
- **Connection Management**: WebSocket connectivity, heartbeat mechanisms, reconnection logic
- **Data Processing**: Data parsing, transformation, and validation
- **API Integration**: External service communication and error handling
- **Configuration**: Settings validation and environment compatibility
- **Monitoring**: Metrics collection and alerting functionality

ARGUMENTS: <task_file> <task_number>