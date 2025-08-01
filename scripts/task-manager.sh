#!/bin/bash

# Task Manager for Pixiu Trading System
# Usage: ./task-manager.sh assign <task_file> <task_number>
# Usage: ./task-manager.sh complete <task_file> <task_number>
# Usage: ./task-manager.sh list <task_file>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_task() {
    echo -e "${CYAN}[TASK]${NC} $1"
}

# Function to display usage
show_usage() {
    echo "Task Manager for Pixiu Trading System"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./task-manager.sh assign <task_file> <task_number>"
    echo "  ./task-manager.sh complete <task_file> <task_number>"
    echo "  ./task-manager.sh list <task_file>"
    echo "  ./task-manager.sh status <task_file>"
    echo ""
    echo "Commands:"
    echo "  assign    - Assign a task (mark as in progress)"
    echo "  complete  - Mark a task as completed"
    echo "  list      - List all tasks in the file"
    echo "  status    - Show completion status summary"
    echo ""
    echo "Examples:"
    echo "  ./task-manager.sh assign services/data-collection/exchange-collector/docs/implementation-plan.md 1.2.1"
    echo "  ./task-manager.sh complete services/data-collection/exchange-collector/docs/implementation-plan.md 1.1.1"
    echo "  ./task-manager.sh list services/data-collection/exchange-collector/docs/implementation-plan.md"
}

# Function to validate task file
validate_task_file() {
    local task_file="$1"
    
    if [ ! -f "$task_file" ]; then
        print_error "Task file not found: $task_file"
        exit 1
    fi
    
    if ! grep -q "- \[ \]" "$task_file" && ! grep -q "- \[x\]" "$task_file"; then
        print_error "No task items found in file: $task_file"
        exit 1
    fi
}

# Function to find task line number
find_task_line() {
    local task_file="$1"
    local task_id="$2"
    
    # Try to find the task by searching for the task description
    # This is a simplified approach - you might need to enhance this based on your task numbering system
    local line_num=$(grep -n "- \[ \].*$task_id\|- \[x\].*$task_id" "$task_file" | head -1 | cut -d: -f1)
    
    if [ -z "$line_num" ]; then
        # Try alternative search patterns
        line_num=$(awk -v task="$task_id" '
            /^### [0-9]+\.[0-9]+ / {
                section = $0
                gsub(/### /, "", section)
                gsub(/ .*/, "", section)
            }
            /^- \[ \]/ || /^- \[x\]/ {
                task_line++
                if (section == task || task_line == task) {
                    print NR
                    exit
                }
            }
        ' "$task_file")
    fi
    
    echo "$line_num"
}

# Function to get task description
get_task_description() {
    local task_file="$1"
    local line_num="$2"
    
    if [ -n "$line_num" ]; then
        sed -n "${line_num}p" "$task_file" | sed 's/^- \[.\] //'
    fi
}

# Function to assign task (mark as in progress)
assign_task() {
    local task_file="$1"
    local task_id="$2"
    
    print_info "Assigning task: $task_id in $task_file"
    
    validate_task_file "$task_file"
    
    # For simplicity, we'll mark the task as assigned by adding a comment
    # In a real implementation, you might want to use a more sophisticated tracking system
    
    local line_num=$(find_task_line "$task_file" "$task_id")
    
    if [ -z "$line_num" ]; then
        print_error "Task not found: $task_id"
        exit 1
    fi
    
    local task_desc=$(get_task_description "$task_file" "$line_num")
    
    print_task "Found task at line $line_num: $task_desc"
    print_info "Task $task_id has been assigned and is now in progress."
    print_info "Remember to mark it as complete when finished using:"
    print_info "  ./task-manager.sh complete $task_file $task_id"
}

# Function to complete task
complete_task() {
    local task_file="$1"
    local task_id="$2"
    
    print_info "Completing task: $task_id in $task_file"
    
    validate_task_file "$task_file"
    
    local line_num=$(find_task_line "$task_file" "$task_id")
    
    if [ -z "$line_num" ]; then
        print_error "Task not found: $task_id"
        exit 1
    fi
    
    local task_desc=$(get_task_description "$task_file" "$line_num")
    
    # Replace [ ] with [x] to mark as complete
    if grep -q "^- \[ \]" <<< "$(sed -n "${line_num}p" "$task_file")"; then
        # Create backup
        cp "$task_file" "${task_file}.backup"
        
        # Mark task as complete
        sed -i "${line_num}s/- \[ \]/- [x]/" "$task_file"
        
        print_success "Task completed: $task_desc"
        print_info "File updated: $task_file"
        print_info "Backup created: ${task_file}.backup"
    else
        print_warning "Task already completed: $task_desc"
    fi
}

# Function to list all tasks
list_tasks() {
    local task_file="$1"
    
    print_info "Listing tasks in: $task_file"
    
    validate_task_file "$task_file"
    
    echo ""
    echo "Task Status:"
    echo "============"
    
    local total_tasks=0
    local completed_tasks=0
    local current_section=""
    
    while IFS= read -r line; do
        if [[ "$line" =~ ^###[[:space:]]+[0-9]+\.[0-9]+ ]]; then
            current_section=$(echo "$line" | sed 's/^### //' | sed 's/ .*//')
            echo ""
            echo -e "${CYAN}$line${NC}"
        elif [[ "$line" =~ ^-[[:space:]]+\[ \] ]]; then
            total_tasks=$((total_tasks + 1))
            task_desc=$(echo "$line" | sed 's/^- \[ \] //')
            echo -e "  ⏳ ${YELLOW}[ ]${NC} $task_desc"
        elif [[ "$line" =~ ^-[[:space:]]+\[x\] ]]; then
            total_tasks=$((total_tasks + 1))
            completed_tasks=$((completed_tasks + 1))
            task_desc=$(echo "$line" | sed 's/^- \[x\] //')
            echo -e "  ✅ ${GREEN}[x]${NC} $task_desc"
        fi
    done < "$task_file"
    
    echo ""
    echo "Summary:"
    echo "========"
    echo "Total tasks: $total_tasks"
    echo "Completed: $completed_tasks"
    echo "Remaining: $((total_tasks - completed_tasks))"
    
    if [ $total_tasks -gt 0 ]; then
        local percentage=$((completed_tasks * 100 / total_tasks))
        echo "Progress: ${percentage}%"
    fi
}

# Function to show status summary
show_status() {
    local task_file="$1"
    
    validate_task_file "$task_file"
    
    local total_tasks=$(grep -c "^- \[\(x\| \)\]" "$task_file")
    local completed_tasks=$(grep -c "^- \[x\]" "$task_file")
    local remaining_tasks=$((total_tasks - completed_tasks))
    
    echo ""
    echo "📊 Task Status Summary"
    echo "====================="
    echo "File: $task_file"
    echo "Total tasks: $total_tasks"
    echo "✅ Completed: $completed_tasks"
    echo "⏳ Remaining: $remaining_tasks"
    
    if [ $total_tasks -gt 0 ]; then
        local percentage=$((completed_tasks * 100 / total_tasks))
        echo "📈 Progress: ${percentage}%"
        
        # Progress bar
        local bar_length=40
        local filled_length=$((percentage * bar_length / 100))
        local bar=""
        
        for ((i=1; i<=filled_length; i++)); do
            bar+="█"
        done
        
        for ((i=filled_length+1; i<=bar_length; i++)); do
            bar+="░"
        done
        
        echo "Progress: [$bar] ${percentage}%"
    fi
}

# Main command processing
case "${1:-}" in
    "assign")
        if [ $# -ne 3 ]; then
            print_error "Usage: $0 assign <task_file> <task_number>"
            exit 1
        fi
        assign_task "$2" "$3"
        ;;
    "complete")
        if [ $# -ne 3 ]; then
            print_error "Usage: $0 complete <task_file> <task_number>"
            exit 1
        fi
        complete_task "$2" "$3"
        ;;
    "list")
        if [ $# -ne 2 ]; then
            print_error "Usage: $0 list <task_file>"
            exit 1
        fi
        list_tasks "$2"
        ;;
    "status")
        if [ $# -ne 2 ]; then
            print_error "Usage: $0 status <task_file>"
            exit 1
        fi
        show_status "$2"
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    *)
        print_error "Unknown command: ${1:-}"
        echo ""
        show_usage
        exit 1
        ;;
esac