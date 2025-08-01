# /complete - Task Completion Command

This command marks tasks as completed and updates project documents.

## Usage
```
/complete <task_file> <task_number>
```

## Parameters
- `task_file`: Path to the task document (e.g., `services/data-collection/exchange-collector/docs/implementation-plan.md`)
- `task_number`: Task identifier (e.g., `1.1.1`, `2.1`, etc.)

## Examples
```
/complete services/data-collection/exchange-collector/docs/implementation-plan.md 1.1.1
/complete services/data-collection/exchange-collector/docs/implementation-plan.md 2.1
```

## What it does
1. Validates the task file and locates the specified task
2. Updates the task document to mark the task as completed ([ ] → [x])
3. Updates the Claude Code todo list to mark the task as completed
4. Creates a backup of the original file
5. Shows completion summary and next available tasks
6. Commit all the updated files, but ignore the files which contain secret data, for security

## Implementation
The command will:
- Read and parse the task document
- Find the specific task by number/identifier
- Scan all the updated files to ensure there aren't any secret data will be committed
- Commit all the updated files
- Replace `- [ ]` with `- [x]` in the document
- Update the todo list status to completed
- Create backup and show progress summary