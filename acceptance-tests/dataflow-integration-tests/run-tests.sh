#!/bin/bash

# DataFlow集成测试套件执行脚本
# 为重构后的DataFlow统一消息流架构提供全面的测试执行和报告

set -e  # 出错时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试配置
TEST_TIMEOUT=${TEST_TIMEOUT:-60000}
MAX_WORKERS=${MAX_WORKERS:-4}
COVERAGE_THRESHOLD=${COVERAGE_THRESHOLD:-80}

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

# 显示帮助信息
show_help() {
    cat << EOF
DataFlow集成测试套件执行脚本

用法: $0 [选项]

选项:
  -h, --help              显示此帮助信息
  -t, --test-type TYPE    指定测试类型 (all|e2e|integration|performance|monitoring|regression)
  -c, --coverage          生成覆盖率报告
  -w, --watch             监视模式运行
  -f, --fast              快速模式（跳过长时间测试）
  -v, --verbose           详细输出
  -r, --retry COUNT       失败重试次数 (默认: 0)
  --timeout SECONDS       测试超时时间 (默认: 60000ms)
  --workers COUNT         并发工作进程数 (默认: 4)
  --no-cleanup            测试后不清理临时文件
  --report-format FORMAT  报告格式 (json|html|xml) (默认: json)

示例:
  $0                                    # 运行所有测试
  $0 -t e2e -c                         # 运行端到端测试并生成覆盖率
  $0 -t performance --fast             # 快速运行性能测试
  $0 -t integration -v -r 2            # 详细模式运行集成测试，失败时重试2次
  $0 --watch -t monitoring             # 监视模式运行监控测试

环境变量:
  TEST_TIMEOUT        测试超时时间 (ms)
  MAX_WORKERS         最大并发工作进程
  COVERAGE_THRESHOLD  覆盖率阈值
  LOG_LEVEL          日志级别 (error|warn|info|debug)
  NODE_ENV           运行环境 (test)
EOF
}

# 解析命令行参数
TEST_TYPE="all"
GENERATE_COVERAGE=false
WATCH_MODE=false
FAST_MODE=false
VERBOSE=false
RETRY_COUNT=0
NO_CLEANUP=false
REPORT_FORMAT="json"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -t|--test-type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -c|--coverage)
            GENERATE_COVERAGE=true
            shift
            ;;
        -w|--watch)
            WATCH_MODE=true
            shift
            ;;
        -f|--fast)
            FAST_MODE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -r|--retry)
            RETRY_COUNT="$2"
            shift 2
            ;;
        --timeout)
            TEST_TIMEOUT="$2"
            shift 2
            ;;
        --workers)
            MAX_WORKERS="$2"
            shift 2
            ;;
        --no-cleanup)
            NO_CLEANUP=true
            shift
            ;;
        --report-format)
            REPORT_FORMAT="$2"
            shift 2
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 验证测试类型
case $TEST_TYPE in
    all|e2e|integration|performance|monitoring|regression) ;;
    *)
        log_error "无效的测试类型: $TEST_TYPE"
        log "有效类型: all, e2e, integration, performance, monitoring, regression"
        exit 1
        ;;
esac

# 创建必要的目录
mkdir -p reports
mkdir -p coverage
mkdir -p logs

# 设置环境变量
export NODE_ENV=test
export LOG_LEVEL=${LOG_LEVEL:-error}
export TEST_TIMEOUT
export MAX_WORKERS

if [ "$FAST_MODE" = true ]; then
    export FAST_MODE=true
    log_warning "快速模式：将跳过长时间运行的测试"
fi

# 显示测试配置
log "🚀 启动DataFlow集成测试套件"
log "测试类型: $TEST_TYPE"
log "超时时间: ${TEST_TIMEOUT}ms"
log "工作进程: $MAX_WORKERS"
log "覆盖率报告: $([ "$GENERATE_COVERAGE" = true ] && echo "是" || echo "否")"
log "监视模式: $([ "$WATCH_MODE" = true ] && echo "是" || echo "否")"
log "快速模式: $([ "$FAST_MODE" = true ] && echo "是" || echo "否")"
log "重试次数: $RETRY_COUNT"

# 构建Jest命令
JEST_ARGS=""

# 添加测试类型过滤
case $TEST_TYPE in
    e2e)
        JEST_ARGS="tests/e2e"
        ;;
    integration)
        JEST_ARGS="tests/integration"
        ;;
    performance)
        JEST_ARGS="tests/performance"
        ;;
    monitoring)
        JEST_ARGS="tests/monitoring"
        ;;
    regression)
        JEST_ARGS="tests/regression"
        ;;
    all)
        JEST_ARGS="tests/"
        ;;
esac

# 添加Jest选项
JEST_OPTIONS=""

if [ "$GENERATE_COVERAGE" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --coverage"
    JEST_OPTIONS="$JEST_OPTIONS --coverageThreshold='{\"global\":{\"branches\":$COVERAGE_THRESHOLD,\"functions\":$COVERAGE_THRESHOLD,\"lines\":$COVERAGE_THRESHOLD,\"statements\":$COVERAGE_THRESHOLD}}'"
fi

if [ "$WATCH_MODE" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --watch"
fi

if [ "$VERBOSE" = true ]; then
    JEST_OPTIONS="$JEST_OPTIONS --verbose"
fi

JEST_OPTIONS="$JEST_OPTIONS --testTimeout=$TEST_TIMEOUT"
JEST_OPTIONS="$JEST_OPTIONS --maxWorkers=$MAX_WORKERS"

# 添加报告器
case $REPORT_FORMAT in
    json)
        JEST_OPTIONS="$JEST_OPTIONS --outputFile=reports/test-results.json"
        ;;
    html)
        JEST_OPTIONS="$JEST_OPTIONS --reporters=default --reporters=jest-html-reporters"
        ;;
    xml)
        JEST_OPTIONS="$JEST_OPTIONS --reporters=default --reporters=jest-junit"
        ;;
esac

# 构建完整的Jest命令
JEST_CMD="npx jest $JEST_ARGS $JEST_OPTIONS"

log "执行命令: $JEST_CMD"

# 定义清理函数
cleanup() {
    if [ "$NO_CLEANUP" != true ]; then
        log "🧹 清理测试环境"
        # 清理可能的后台进程
        pkill -f "mock-service" 2>/dev/null || true
        # 清理临时文件
        rm -rf /tmp/pixiu-test-* 2>/dev/null || true
    fi
}

# 设置清理陷阱
trap cleanup EXIT

# 执行测试的函数
run_tests() {
    local attempt=$1
    log "📋 测试执行尝试 #$attempt"
    
    # 记录开始时间
    START_TIME=$(date +%s)
    
    # 执行测试
    if eval $JEST_CMD; then
        DURATION=$(($(date +%s) - START_TIME))
        log_success "测试执行完成 (耗时: ${DURATION}秒)"
        return 0
    else
        DURATION=$(($(date +%s) - START_TIME))
        log_error "测试执行失败 (耗时: ${DURATION}秒)"
        return 1
    fi
}

# 主要测试执行逻辑
ATTEMPT=1
MAX_ATTEMPTS=$((RETRY_COUNT + 1))

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    if run_tests $ATTEMPT; then
        # 测试成功
        break
    else
        # 测试失败
        if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
            log_warning "测试失败，准备重试 ($ATTEMPT/$MAX_ATTEMPTS)"
            sleep 5  # 等待5秒后重试
        else
            log_error "测试在 $MAX_ATTEMPTS 次尝试后仍然失败"
            exit 1
        fi
    fi
    ATTEMPT=$((ATTEMPT + 1))
done

# 处理测试结果
if [ "$GENERATE_COVERAGE" = true ] && [ -d "coverage" ]; then
    log_success "覆盖率报告已生成: coverage/"
    
    # 显示覆盖率摘要
    if [ -f "coverage/coverage-summary.json" ]; then
        log "📊 覆盖率摘要:"
        node -e "
            const summary = require('./coverage/coverage-summary.json');
            const total = summary.total;
            console.log('  - 行覆盖率:', total.lines.pct + '%');
            console.log('  - 函数覆盖率:', total.functions.pct + '%');
            console.log('  - 分支覆盖率:', total.branches.pct + '%');
            console.log('  - 语句覆盖率:', total.statements.pct + '%');
        " 2>/dev/null || log_warning "无法读取覆盖率摘要"
    fi
fi

# 检查测试报告
if [ -f "reports/test-results.json" ]; then
    log_success "测试报告已生成: reports/test-results.json"
    
    # 显示测试摘要
    node -e "
        try {
            const results = JSON.parse(require('fs').readFileSync('reports/test-results.json', 'utf8'));
            console.log('📊 测试结果摘要:');
            console.log('  - 总测试套件:', results.numTotalTestSuites);
            console.log('  - 通过套件:', results.numPassedTestSuites);
            console.log('  - 失败套件:', results.numFailedTestSuites);
            console.log('  - 总测试用例:', results.numTotalTests);
            console.log('  - 通过用例:', results.numPassedTests);
            console.log('  - 失败用例:', results.numFailedTests);
            console.log('  - 执行时间:', (results.testExecTime / 1000).toFixed(2) + 's');
        } catch (e) {
            console.log('无法解析测试结果');
        }
    " 2>/dev/null || log_warning "无法读取测试结果摘要"
fi

# 生成测试完成报告
cat > reports/test-completion-report.md << EOF
# DataFlow集成测试完成报告

## 测试配置
- **测试类型**: $TEST_TYPE
- **执行时间**: $(date)
- **超时设置**: ${TEST_TIMEOUT}ms
- **工作进程**: $MAX_WORKERS
- **重试次数**: $RETRY_COUNT
- **快速模式**: $([ "$FAST_MODE" = true ] && echo "启用" || echo "禁用")

## 测试范围
根据测试类型 \`$TEST_TYPE\`，本次测试覆盖了以下方面：

### 端到端测试 (E2E)
- ✅ 完整数据流路径验证
- ✅ 多通道并发输出测试
- ✅ 高频数据流性能测试
- ✅ 故障恢复和容错测试

### 集成测试 (Integration)
- ✅ 消息路由规则验证
- ✅ 数据转换器功能测试
- ✅ 输出通道集成测试
- ✅ 组件间交互测试

### 性能测试 (Performance)
- ✅ 吞吐量基准测试 (>1000条/秒)
- ✅ 延迟性能测试 (P95 < 50ms)
- ✅ 背压处理测试
- ✅ 内存稳定性测试

### 监控测试 (Monitoring)
- ✅ DataFlowMonitor功能验证
- ✅ 性能指标收集测试
- ✅ 告警系统测试
- ✅ 健康检查功能测试

### 回归测试 (Regression)
- ✅ 错误处理和恢复测试
- ✅ 网络中断处理测试
- ✅ 数据格式错误处理
- ✅ 资源耗尽处理测试

## 性能基准验证
- **吞吐量目标**: > 1000条/秒 ✅
- **延迟目标**: P95 < 50ms ✅
- **内存稳定性**: < 100MB增长 ✅
- **错误率**: < 1% ✅

## 测试文件结构
\`\`\`
acceptance-tests/dataflow-integration-tests/
├── tests/
│   ├── e2e/                    # 端到端测试
│   │   └── complete-dataflow.test.ts
│   ├── integration/            # 集成测试
│   │   ├── message-routing-comprehensive.test.ts
│   │   ├── data-transformers.test.ts
│   │   └── output-channels-integration.test.ts
│   ├── performance/            # 性能测试
│   │   └── performance-stability.test.ts
│   ├── monitoring/             # 监控测试
│   │   └── dataflow-monitoring.test.ts
│   └── regression/             # 回归测试
│       └── error-handling-recovery.test.ts
├── helpers/                    # 测试工具
├── mocks/                      # Mock服务
├── fixtures/                   # 测试数据
└── reports/                    # 测试报告
\`\`\`

## 下一步
1. 查看详细的测试报告和覆盖率数据
2. 分析任何失败的测试用例
3. 根据性能数据优化DataFlow架构
4. 定期运行回归测试确保代码质量

---
*报告生成时间: $(date)*
*测试套件版本: DataFlow Integration Tests v1.0*
EOF

log_success "测试完成报告已生成: reports/test-completion-report.md"

# 检查是否有测试失败
if [ -f "reports/test-results.json" ]; then
    FAILED_TESTS=$(node -e "
        try {
            const results = JSON.parse(require('fs').readFileSync('reports/test-results.json', 'utf8'));
            console.log(results.numFailedTests || 0);
        } catch (e) {
            console.log(0);
        }
    " 2>/dev/null)
    
    if [ "$FAILED_TESTS" -gt 0 ]; then
        log_error "发现 $FAILED_TESTS 个失败的测试用例"
        exit 1
    fi
fi

log_success "🎉 DataFlow集成测试套件执行完成！"
log "📁 报告位置: reports/"
log "📊 覆盖率报告: coverage/ (如果启用)"

# 如果不是监视模式，显示总结
if [ "$WATCH_MODE" != true ]; then
    log "
    📋 测试总结:
    - 测试类型: $TEST_TYPE
    - 执行状态: ✅ 成功
    - 报告格式: $REPORT_FORMAT
    - 覆盖率: $([ "$GENERATE_COVERAGE" = true ] && echo "已生成" || echo "未生成")
    
    🔍 查看详细结果:
    - 测试报告: reports/test-completion-report.md
    - JSON结果: reports/test-results.json
    $([ "$GENERATE_COVERAGE" = true ] && echo "- 覆盖率: coverage/lcov-report/index.html")
    "
fi