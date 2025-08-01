# /status - Task Status Command

This command shows the current status of tasks in project documents.

## Usage
```
/status <task_file>
```

## Parameters
- `task_file`: Path to the task document (e.g., `services/data-collection/exchange-collector/docs/implementation-plan.md`)

## Examples
```
/status services/data-collection/exchange-collector/docs/implementation-plan.md
```

## What it does
1. Reads the task document and analyzes all tasks
2. Shows completion status with visual indicators
3. Displays progress statistics and summary
4. Lists next available tasks to work on

## Implementation
The command will:
- Parse the task document for all task items
- Count completed vs remaining tasks
- Show visual progress bar and percentage
- Highlight current in-progress tasks
- Suggest next tasks to assign