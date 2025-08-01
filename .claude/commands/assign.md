# /assign - Task Assignment Command

This command assigns and tracks implementation tasks from project documents.

## Usage
```
/assign <task_file> <task_number>
```

## Parameters
- `task_file`: Path to the task document (e.g., `services/data-collection/exchange-collector/docs/implementation-plan.md`)
- `task_number`: Task identifier (e.g., `1.2.1`, `2.1`, etc.)

## Examples
```
/assign services/data-collection/exchange-collector/docs/implementation-plan.md 1.2.1
/assign services/data-collection/exchange-collector/docs/implementation-plan.md 2.1
```

## What it does
1. Validates the task file exists and contains task items
2. Locates the specified task in the document
3. Creates a todo list with the task marked as in_progress
4. Provides task details and next steps
5. Ask if the task can start or need more discussion

## Implementation
The command will:
- Read and parse the task document
- Find the specific task by number/identifier
- Add it to the Claude Code todo list
- Mark the task as in_progress
- Display task details and context
- Ask to start the task, or other things to do