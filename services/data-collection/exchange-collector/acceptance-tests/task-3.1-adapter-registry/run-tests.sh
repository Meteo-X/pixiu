#!/bin/bash

# Task 3.1 适配器注册系统 - 验收测试执行脚本
# 
# 这个脚本提供了完整的测试执行和环境管理功能
# 支持多种测试模式和配置选项

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置默认值
TEST_TYPE="all"
COVERAGE=false
VERBOSE=false
WATCH=false
CI_MODE=false
CLEANUP=true
TIMEOUT=30000
PARALLEL=1

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    cat << EOF
Task 3.1 适配器注册系统 - 验收测试执行脚本

用法: $0 [选项]

选项:
    -t, --type TYPE         测试类型 (all, requirements, api, integration, performance, regression, security)
    -c, --coverage          生成覆盖率报告
    -v, --verbose           详细输出
    -w, --watch             监视模式
    --ci                    CI 模式
    --no-cleanup            测试后不清理
    --timeout SECONDS       测试超时时间（秒）
    --parallel WORKERS      并行执行器数量
    -h, --help              显示帮助信息

测试类型:
    all                     运行所有测试（默认）
    requirements            需求验收测试
    api                     API 合约测试
    integration             集成测试
    performance             性能测试
    regression              回归测试
    security                安全测试

示例:
    $0                                      # 运行所有测试
    $0 -t requirements -c -v                # 运行需求测试，生成覆盖率，详细输出
    $0 -t performance --timeout 60         # 运行性能测试，60秒超时
    $0 --ci                                 # CI 模式运行
    $0 -w                                   # 监视模式

环境变量:
    PUBSUB_EMULATOR_HOST    Pub/Sub 模拟器地址（默认: localhost:8085）
    LOG_LEVEL               日志级别（默认: error）
    NODE_ENV                环境（默认: test）
EOF
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--type)
                TEST_TYPE="$2"
                shift 2
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            --ci)
                CI_MODE=true
                shift
                ;;
            --no-cleanup)
                CLEANUP=false
                shift
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --parallel)
                PARALLEL="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# 验证环境
check_environment() {
    log_info "检查测试环境..."
    
    # 检查 Node.js 版本
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 18 ]]; then
        log_error "需要 Node.js 18 或更高版本，当前版本: $(node --version)"
        exit 1
    fi
    
    # 检查依赖
    if [[ ! -f "package.json" ]]; then
        log_error "package.json 不存在"
        exit 1
    fi
    
    if [[ ! -d "node_modules" ]]; then
        log_warning "依赖未安装，正在安装..."
        npm install
    fi
    
    log_success "环境检查通过"
}

# 检查依赖服务
check_services() {
    log_info "检查依赖服务..."
    
    # 检查 Pub/Sub 模拟器
    local pubsub_host=${PUBSUB_EMULATOR_HOST:-"localhost:8085"}
    if ! curl -s "http://${pubsub_host}" > /dev/null; then
        log_warning "Pub/Sub 模拟器未运行，尝试启动..."
        start_pubsub_emulator
    else
        log_success "Pub/Sub 模拟器运行正常"
    fi
}

# 启动 Pub/Sub 模拟器
start_pubsub_emulator() {
    log_info "启动 Pub/Sub 模拟器..."
    
    # 停止现有的模拟器
    docker stop pubsub-emulator 2>/dev/null || true
    docker rm pubsub-emulator 2>/dev/null || true
    
    # 启动新的模拟器
    docker run -d --name pubsub-emulator -p 8085:8085 \
        gcr.io/google.com/cloudsdktool/cloud-sdk:emulators \
        gcloud beta emulators pubsub start --host-port=0.0.0.0:8085
    
    # 等待启动
    local retries=30
    while [[ $retries -gt 0 ]]; do
        if curl -s "http://localhost:8085" > /dev/null; then
            log_success "Pub/Sub 模拟器启动成功"
            return 0
        fi
        log_info "等待 Pub/Sub 模拟器启动... (剩余重试: $retries)"
        sleep 2
        ((retries--))
    done
    
    log_error "Pub/Sub 模拟器启动失败"
    exit 1
}

# 设置环境变量
setup_environment() {
    log_info "设置测试环境变量..."
    
    export NODE_ENV=test
    export LOG_LEVEL=${LOG_LEVEL:-error}
    export PUBSUB_EMULATOR_HOST=${PUBSUB_EMULATOR_HOST:-localhost:8085}
    export TEST_TIMEOUT=$((TIMEOUT * 1000))  # 转换为毫秒
    
    if [[ $CI_MODE == true ]]; then
        export CI=true
    fi
    
    log_info "环境变量设置完成:"
    log_info "  NODE_ENV: $NODE_ENV"
    log_info "  LOG_LEVEL: $LOG_LEVEL"
    log_info "  PUBSUB_EMULATOR_HOST: $PUBSUB_EMULATOR_HOST"
    log_info "  TEST_TIMEOUT: $TEST_TIMEOUT"
}

# 构建 Jest 命令
build_jest_command() {
    local cmd="npx jest"
    
    # 测试类型
    case $TEST_TYPE in
        "requirements")
            cmd="$cmd tests/acceptance/requirements.test.ts"
            ;;
        "api")
            cmd="$cmd tests/acceptance/api-contracts.test.ts"
            ;;
        "integration")
            cmd="$cmd tests/integration"
            ;;
        "performance")
            cmd="$cmd tests/performance"
            ;;
        "regression")
            cmd="$cmd tests/regression"
            ;;
        "security")
            cmd="$cmd tests/security"
            ;;
        "all")
            # 运行所有测试
            ;;
        *)
            log_error "未知的测试类型: $TEST_TYPE"
            exit 1
            ;;
    esac
    
    # 其他选项
    if [[ $COVERAGE == true ]]; then
        cmd="$cmd --coverage"
    fi
    
    if [[ $VERBOSE == true ]]; then
        cmd="$cmd --verbose"
    fi
    
    if [[ $WATCH == true ]]; then
        cmd="$cmd --watch"
    fi
    
    if [[ $CI_MODE == true ]]; then
        cmd="$cmd --ci --passWithNoTests"
    fi
    
    cmd="$cmd --testTimeout=$((TIMEOUT * 1000))"
    cmd="$cmd --maxWorkers=$PARALLEL"
    cmd="$cmd --detectOpenHandles"
    cmd="$cmd --forceExit"
    
    echo "$cmd"
}

# 运行测试
run_tests() {
    local cmd=$(build_jest_command)
    
    log_info "运行测试..."
    log_info "测试类型: $TEST_TYPE"
    log_info "执行命令: $cmd"
    
    # 创建报告目录
    mkdir -p reports coverage
    
    # 运行测试
    if eval "$cmd"; then
        log_success "测试执行成功"
        return 0
    else
        log_error "测试执行失败"
        return 1
    fi
}

# 生成报告
generate_reports() {
    if [[ $COVERAGE == true ]]; then
        log_info "生成覆盖率报告..."
        
        if [[ -d "coverage" ]]; then
            log_success "覆盖率报告生成在: coverage/lcov-report/index.html"
        fi
    fi
    
    if [[ -d "reports" ]]; then
        log_success "测试报告生成在: reports/"
    fi
}

# 清理资源
cleanup() {
    if [[ $CLEANUP == true && $WATCH == false ]]; then
        log_info "清理测试资源..."
        
        # 停止 Pub/Sub 模拟器
        docker stop pubsub-emulator 2>/dev/null || true
        docker rm pubsub-emulator 2>/dev/null || true
        
        log_success "清理完成"
    fi
}

# 主函数
main() {
    local start_time=$(date +%s)
    
    # 设置清理陷阱
    trap cleanup EXIT
    
    # 解析参数
    parse_args "$@"
    
    # 显示配置
    log_info "Task 3.1 适配器注册系统 - 验收测试"
    log_info "========================================"
    log_info "测试类型: $TEST_TYPE"
    log_info "覆盖率: $COVERAGE"
    log_info "详细输出: $VERBOSE"
    log_info "监视模式: $WATCH"
    log_info "CI 模式: $CI_MODE"
    log_info "清理: $CLEANUP"
    log_info "超时: ${TIMEOUT}s"
    log_info "并行数: $PARALLEL"
    log_info "========================================"
    
    # 执行步骤
    check_environment
    setup_environment
    check_services
    
    # 运行测试
    if run_tests; then
        generate_reports
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_success "测试完成！"
        log_info "总耗时: ${duration}s"
        
        if [[ $COVERAGE == true ]]; then
            log_info "覆盖率报告: coverage/lcov-report/index.html"
        fi
        
        exit 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log_error "测试失败！"
        log_info "总耗时: ${duration}s"
        
        exit 1
    fi
}

# 检查是否为直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi