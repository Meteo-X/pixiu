#!/bin/bash

# BaseConnectionManager集成功能测试套件运行脚本
# 提供多种测试运行选项和报告生成功能

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
BaseConnectionManager集成功能测试套件

用法: $0 [选项] [测试类别]

选项:
  -h, --help              显示帮助信息
  -v, --verbose           详细输出模式
  -c, --coverage          生成覆盖率报告
  -w, --watch             监视模式（文件变更时自动运行）
  -s, --silent            静默模式（最少输出）
  --ci                    CI模式（适合持续集成环境）
  --memory-limit <size>   设置Node.js内存限制（默认: 4096MB）
  --timeout <seconds>     设置测试超时时间（默认: 120秒）
  --max-workers <number>  设置最大并发工作器数量（默认: 4）
  --debug                 启用调试模式

测试类别:
  all                     运行所有测试（默认）
  connection              连接管理测试
  error-handling          错误处理和恢复测试
  performance             性能监控测试
  integration             集成测试
  stress                  压力和边界测试
  unit                    单元测试
  smoke                   冒烟测试（快速验证）

示例:
  $0                      # 运行所有测试
  $0 connection -v        # 详细运行连接测试
  $0 -c performance       # 运行性能测试并生成覆盖率
  $0 --ci all            # CI模式运行所有测试
  $0 --watch connection  # 监视模式运行连接测试

报告:
  测试完成后，报告将保存在以下位置：
  - 覆盖率报告: ./coverage/lcov-report/index.html
  - JSON结果: ./reports/test-results.json
  - JUnit XML: ./reports/junit.xml

EOF
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装或不在PATH中"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm未安装或不在PATH中"
        exit 1
    fi
    
    # 检查Node.js版本
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"
    
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
        log_warning "Node.js版本 ($NODE_VERSION) 可能不兼容，推荐版本 >= $REQUIRED_VERSION"
    fi
    
    log_success "依赖检查完成"
}

# 安装依赖
install_dependencies() {
    log_info "安装测试依赖..."
    
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        npm install
        if [ $? -eq 0 ]; then
            log_success "依赖安装完成"
        else
            log_error "依赖安装失败"
            exit 1
        fi
    else
        log_info "依赖已是最新，跳过安装"
    fi
}

# 清理环境
cleanup_environment() {
    log_info "清理测试环境..."
    
    # 清理旧的报告
    rm -rf coverage reports
    mkdir -p reports
    
    # 清理临时文件
    find . -name "*.log" -type f -delete 2>/dev/null || true
    find . -name ".tmp-*" -type f -delete 2>/dev/null || true
    
    log_success "环境清理完成"
}

# 设置环境变量
setup_environment() {
    log_info "设置测试环境变量..."
    
    export NODE_ENV=test
    export LOG_LEVEL=${LOG_LEVEL:-error}
    
    # CI环境特殊配置
    if [ "$CI_MODE" = "true" ]; then
        export CI=true
        export FORCE_COLOR=0
        export NODE_OPTIONS="--max-old-space-size=$MEMORY_LIMIT --unhandled-rejections=strict"
    else
        export NODE_OPTIONS="--max-old-space-size=$MEMORY_LIMIT --expose-gc"
    fi
    
    log_success "环境设置完成"
}

# 构建Jest命令
build_jest_command() {
    local test_category="$1"
    local jest_cmd="npx jest"
    
    # 基础配置
    jest_cmd="$jest_cmd --config jest.config.js"
    jest_cmd="$jest_cmd --maxWorkers=$MAX_WORKERS"
    jest_cmd="$jest_cmd --testTimeout=$((TIMEOUT * 1000))"
    
    # 根据测试类别设置测试路径
    case "$test_category" in
        "connection")
            jest_cmd="$jest_cmd --testPathPattern=connection-management"
            ;;
        "error-handling")
            jest_cmd="$jest_cmd --testPathPattern=error-handling"
            ;;
        "performance")
            jest_cmd="$jest_cmd --testPathPattern=performance-monitoring"
            ;;
        "integration")
            jest_cmd="$jest_cmd --testPathPattern=integration"
            ;;
        "stress")
            jest_cmd="$jest_cmd --testPathPattern=stress-testing"
            ;;
        "unit")
            jest_cmd="$jest_cmd --testPathPattern=unit"
            ;;
        "smoke")
            jest_cmd="$jest_cmd --testPathPattern=smoke"
            ;;
        "all"|*)
            # 运行所有测试
            ;;
    esac
    
    # 覆盖率选项
    if [ "$COVERAGE" = "true" ]; then
        jest_cmd="$jest_cmd --coverage"
        jest_cmd="$jest_cmd --coverageDirectory=coverage"
        jest_cmd="$jest_cmd --coverageReporters=text,lcov,html,json-summary"
    fi
    
    # 输出选项
    if [ "$VERBOSE" = "true" ]; then
        jest_cmd="$jest_cmd --verbose"
    fi
    
    if [ "$SILENT" = "true" ]; then
        jest_cmd="$jest_cmd --silent"
    fi
    
    # 监视模式
    if [ "$WATCH" = "true" ]; then
        jest_cmd="$jest_cmd --watch"
    fi
    
    # CI模式
    if [ "$CI_MODE" = "true" ]; then
        jest_cmd="$jest_cmd --ci"
        jest_cmd="$jest_cmd --watchman=false"
        jest_cmd="$jest_cmd --detectOpenHandles"
        jest_cmd="$jest_cmd --forceExit"
        jest_cmd="$jest_cmd --outputFile=reports/test-results.json"
        jest_cmd="$jest_cmd --json"
    fi
    
    # 调试模式
    if [ "$DEBUG" = "true" ]; then
        jest_cmd="$jest_cmd --no-cache"
        jest_cmd="$jest_cmd --runInBand"
        export LOG_LEVEL=debug
    fi
    
    echo "$jest_cmd"
}

# 运行测试
run_tests() {
    local test_category="$1"
    local jest_cmd=$(build_jest_command "$test_category")
    
    log_info "开始运行测试..."
    log_info "测试类别: $test_category"
    log_info "Jest命令: $jest_cmd"
    
    local start_time=$(date +%s)
    
    # 执行测试
    if eval "$jest_cmd"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "测试完成！耗时: ${duration}秒"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_error "测试失败！耗时: ${duration}秒"
        return 1
    fi
}

# 生成测试报告
generate_reports() {
    if [ "$CI_MODE" = "true" ] && [ -f "reports/test-results.json" ]; then
        log_info "生成JUnit XML报告..."
        
        # 使用Node.js脚本转换JSON到JUnit XML
        node -e "
        const fs = require('fs');
        const results = JSON.parse(fs.readFileSync('reports/test-results.json', 'utf8'));
        
        let xml = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>\\n';
        xml += '<testsuites>';
        
        results.testResults.forEach(suite => {
            const suiteName = suite.name.replace(process.cwd() + '/', '');
            xml += \`<testsuite name=\"\${suiteName}\" tests=\"\${suite.numPassingTests + suite.numFailingTests}\" failures=\"\${suite.numFailingTests}\" time=\"\${suite.perfStats.runtime / 1000}\">\`;
            
            suite.assertionResults.forEach(test => {
                xml += \`<testcase classname=\"\${suiteName}\" name=\"\${test.title}\" time=\"\${test.duration / 1000 || 0}\">\`;
                if (test.status === 'failed') {
                    xml += \`<failure message=\"\${test.failureMessages.join('\\n').replace(/[<>&\"']/g, function(m) { return {'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;',\"'\":'&apos;'}[m]; })}\">\${test.failureMessages.join('\\n')}</failure>\`;
                }
                xml += '</testcase>';
            });
            
            xml += '</testsuite>';
        });
        
        xml += '</testsuites>';
        fs.writeFileSync('reports/junit.xml', xml);
        " && log_success "JUnit XML报告生成完成"
    fi
    
    if [ -d "coverage" ]; then
        log_success "覆盖率报告生成在: coverage/lcov-report/index.html"
    fi
}

# 显示测试摘要
show_summary() {
    echo ""
    echo "=========================================="
    echo "           测试执行摘要"
    echo "=========================================="
    
    if [ -f "reports/test-results.json" ]; then
        echo "详细结果请查看: reports/test-results.json"
    fi
    
    if [ -d "coverage" ]; then
        echo "覆盖率报告: coverage/lcov-report/index.html"
        
        # 显示覆盖率摘要
        if [ -f "coverage/coverage-summary.json" ]; then
            node -e "
            const summary = JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8'));
            console.log('');
            console.log('覆盖率摘要:');
            console.log('  语句覆盖率:', summary.total.statements.pct + '%');
            console.log('  分支覆盖率:', summary.total.branches.pct + '%');
            console.log('  函数覆盖率:', summary.total.functions.pct + '%');
            console.log('  行覆盖率:', summary.total.lines.pct + '%');
            "
        fi
    fi
    
    echo ""
    echo "测试类别说明:"
    echo "  connection      - 连接管理和生命周期测试"
    echo "  error-handling  - 错误处理和恢复策略测试"
    echo "  performance     - 性能监控和优化测试"
    echo "  integration     - 框架集成和兼容性测试"
    echo "  stress          - 压力和边界条件测试"
    echo ""
}

# 主函数
main() {
    # 默认参数
    COVERAGE=false
    VERBOSE=false
    WATCH=false
    SILENT=false
    CI_MODE=false
    DEBUG=false
    MEMORY_LIMIT=4096
    TIMEOUT=120
    MAX_WORKERS=4
    TEST_CATEGORY="all"
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -c|--coverage)
                COVERAGE=true
                shift
                ;;
            -w|--watch)
                WATCH=true
                shift
                ;;
            -s|--silent)
                SILENT=true
                shift
                ;;
            --ci)
                CI_MODE=true
                COVERAGE=true
                shift
                ;;
            --memory-limit)
                MEMORY_LIMIT="$2"
                shift 2
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --max-workers)
                MAX_WORKERS="$2"
                shift 2
                ;;
            --debug)
                DEBUG=true
                VERBOSE=true
                MAX_WORKERS=1
                shift
                ;;
            connection|error-handling|performance|integration|stress|unit|smoke|all)
                TEST_CATEGORY="$1"
                shift
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 执行测试流程
    log_info "BaseConnectionManager集成功能测试套件"
    log_info "测试类别: $TEST_CATEGORY"
    
    check_dependencies
    install_dependencies
    
    if [ "$WATCH" != "true" ]; then
        cleanup_environment
    fi
    
    setup_environment
    
    # 运行测试
    if run_tests "$TEST_CATEGORY"; then
        if [ "$WATCH" != "true" ]; then
            generate_reports
            show_summary
        fi
        exit 0
    else
        if [ "$WATCH" != "true" ]; then
            generate_reports
        fi
        exit 1
    fi
}

# 捕获中断信号
trap 'log_warning "测试被中断"; exit 130' INT TERM

# 运行主函数
main "$@"