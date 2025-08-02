#!/bin/bash

# Task 3.2 配置系统重构 - 接受测试执行脚本
# 提供便捷的测试执行和报告生成功能

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 显示横幅
show_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Task 3.2 配置系统重构 - 接受测试套件                 ║"
    echo "║                                                              ║"
    echo "║  验证配置系统重构的完整实现和功能正确性                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# 显示帮助信息
show_help() {
    echo -e "${YELLOW}用法: $0 [选项]${NC}"
    echo ""
    echo "选项:"
    echo "  -h, --help              显示此帮助信息"
    echo "  -a, --all               运行所有测试 (默认)"
    echo "  -r, --requirements      只运行需求验证测试"
    echo "  -c, --contracts         只运行API契约测试"
    echo "  -i, --integration       只运行集成测试"
    echo "  -p, --performance       只运行性能测试"
    echo "  -s, --security          只运行安全测试"
    echo "  -g, --regression        只运行回归测试"
    echo "  -w, --watch             监控模式运行测试"
    echo "  -v, --verbose           详细输出模式"
    echo "  --coverage              生成覆盖率报告"
    echo "  --ci                    CI模式运行"
    echo "  --clean                 清理构建产物和报告"
    echo "  --setup                 设置测试环境"
    echo "  --benchmark             运行性能基准测试"
    echo ""
    echo "示例:"
    echo "  $0                      # 运行所有测试"
    echo "  $0 -r                   # 只运行需求验证测试"
    echo "  $0 -p --verbose         # 运行性能测试并显示详细输出"
    echo "  $0 --coverage           # 运行所有测试并生成覆盖率报告"
    echo "  $0 --ci                 # CI环境运行"
}

# 检查依赖
check_dependencies() {
    echo -e "${BLUE}🔍 检查依赖...${NC}"
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js 未安装${NC}"
        exit 1
    fi
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm 未安装${NC}"
        exit 1
    fi
    
    # 检查package.json
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json 不存在${NC}"
        exit 1
    fi
    
    # 检查node_modules
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  依赖未安装，正在安装...${NC}"
        npm install
    fi
    
    echo -e "${GREEN}✅ 依赖检查完成${NC}"
}

# 设置测试环境
setup_environment() {
    echo -e "${BLUE}🔧 设置测试环境...${NC}"
    
    # 创建必要的目录
    mkdir -p reports
    mkdir -p coverage
    mkdir -p fixtures/temp
    
    # 设置环境变量
    export NODE_ENV=test
    export LOG_LEVEL=error
    
    # 检查TypeScript编译
    echo -e "${BLUE}📦 检查TypeScript编译...${NC}"
    if ! npx tsc --noEmit; then
        echo -e "${RED}❌ TypeScript编译错误${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ 环境设置完成${NC}"
}

# 清理函数
cleanup() {
    echo -e "${BLUE}🧹 清理资源...${NC}"
    
    # 清理临时文件
    if [ -d "fixtures/temp" ]; then
        rm -rf fixtures/temp/*
    fi
    
    # 清理Jest缓存
    if [ -d ".jest-cache" ]; then
        rm -rf .jest-cache
    fi
    
    echo -e "${GREEN}✅ 清理完成${NC}"
}

# 运行特定测试
run_test() {
    local test_type="$1"
    local test_pattern="$2"
    local description="$3"
    local verbose="${4:-false}"
    
    echo -e "${PURPLE}🧪 运行${description}...${NC}"
    
    local cmd="npm test"
    
    if [ -n "$test_pattern" ]; then
        cmd="$cmd -- --testPathPattern=$test_pattern"
    fi
    
    if [ "$verbose" = true ]; then
        cmd="$cmd --verbose"
    fi
    
    if [ "$COVERAGE" = true ]; then
        cmd="npm run test:coverage"
        if [ -n "$test_pattern" ]; then
            cmd="$cmd -- --testPathPattern=$test_pattern"
        fi
    fi
    
    if [ "$CI_MODE" = true ]; then
        cmd="$cmd --ci --maxWorkers=2"
    fi
    
    echo -e "${BLUE}执行命令: $cmd${NC}"
    
    if eval "$cmd"; then
        echo -e "${GREEN}✅ ${description}通过${NC}"
        return 0
    else
        echo -e "${RED}❌ ${description}失败${NC}"
        return 1
    fi
}

# 生成测试报告
generate_report() {
    echo -e "${BLUE}📊 生成测试报告...${NC}"
    
    # 检查是否有报告文件
    if [ -f "reports/test-report.html" ]; then
        echo -e "${GREEN}📄 HTML报告: $(pwd)/reports/test-report.html${NC}"
    fi
    
    if [ -f "reports/junit.xml" ]; then
        echo -e "${GREEN}📄 JUnit报告: $(pwd)/reports/junit.xml${NC}"
    fi
    
    if [ -d "coverage" ] && [ "$(ls -A coverage)" ]; then
        echo -e "${GREEN}📄 覆盖率报告: $(pwd)/coverage/lcov-report/index.html${NC}"
        
        # 显示覆盖率摘要
        if [ -f "coverage/coverage-summary.json" ]; then
            echo -e "${BLUE}📈 覆盖率摘要:${NC}"
            node -e "
                const summary = require('./coverage/coverage-summary.json');
                const total = summary.total;
                console.log(\`  分支覆盖率: \${total.branches.pct}%\`);
                console.log(\`  函数覆盖率: \${total.functions.pct}%\`);
                console.log(\`  行覆盖率: \${total.lines.pct}%\`);
                console.log(\`  语句覆盖率: \${total.statements.pct}%\`);
            " 2>/dev/null || true
        fi
    fi
    
    echo -e "${GREEN}✅ 报告生成完成${NC}"
}

# 运行性能基准测试
run_benchmark() {
    echo -e "${PURPLE}⚡ 运行性能基准测试...${NC}"
    
    # 设置性能测试环境
    export BENCHMARK_MODE=true
    export NODE_OPTIONS="--max-old-space-size=4096"
    
    # 运行性能测试
    if run_test "performance" "performance" "性能基准测试" true; then
        echo -e "${GREEN}🚀 性能基准测试完成${NC}"
    else
        echo -e "${RED}❌ 性能基准测试失败${NC}"
        return 1
    fi
}

# 主执行函数
main() {
    local test_mode="all"
    local verbose=false
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -a|--all)
                test_mode="all"
                shift
                ;;
            -r|--requirements)
                test_mode="requirements"
                shift
                ;;
            -c|--contracts)
                test_mode="contracts"
                shift
                ;;
            -i|--integration)
                test_mode="integration"
                shift
                ;;
            -p|--performance)
                test_mode="performance"
                shift
                ;;
            -s|--security)
                test_mode="security"
                shift
                ;;
            -g|--regression)
                test_mode="regression"
                shift
                ;;
            -w|--watch)
                echo -e "${YELLOW}🔄 启动监控模式...${NC}"
                npm run test:watch
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            --coverage)
                COVERAGE=true
                shift
                ;;
            --ci)
                CI_MODE=true
                shift
                ;;
            --clean)
                echo -e "${BLUE}🧹 清理构建产物...${NC}"
                rm -rf node_modules coverage reports dist .jest-cache fixtures/temp
                echo -e "${GREEN}✅ 清理完成${NC}"
                exit 0
                ;;
            --setup)
                check_dependencies
                setup_environment
                echo -e "${GREEN}✅ 环境设置完成${NC}"
                exit 0
                ;;
            --benchmark)
                show_banner
                check_dependencies
                setup_environment
                run_benchmark
                generate_report
                cleanup
                exit $?
                ;;
            *)
                echo -e "${RED}未知选项: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 显示横幅
    show_banner
    
    # 记录开始时间
    start_time=$(date +%s)
    
    # 设置错误处理
    trap cleanup EXIT
    
    # 检查依赖和环境
    check_dependencies
    setup_environment
    
    # 执行测试
    local exit_code=0
    
    case $test_mode in
        "all")
            echo -e "${YELLOW}🎯 运行完整测试套件...${NC}"
            
            # 按优先级顺序运行测试
            run_test "requirements" "acceptance/requirements" "需求验证测试" $verbose || exit_code=1
            run_test "contracts" "acceptance/api-contracts" "API契约测试" $verbose || exit_code=1
            run_test "integration" "integration" "集成测试" $verbose || exit_code=1
            run_test "performance" "performance" "性能测试" $verbose || exit_code=1
            run_test "security" "security" "安全测试" $verbose || exit_code=1
            run_test "regression" "regression" "回归测试" $verbose || exit_code=1
            ;;
        "requirements")
            run_test "requirements" "acceptance/requirements" "需求验证测试" $verbose || exit_code=1
            ;;
        "contracts")
            run_test "contracts" "acceptance/api-contracts" "API契约测试" $verbose || exit_code=1
            ;;
        "integration")
            run_test "integration" "integration" "集成测试" $verbose || exit_code=1
            ;;
        "performance")
            run_test "performance" "performance" "性能测试" $verbose || exit_code=1
            ;;
        "security")
            run_test "security" "security" "安全测试" $verbose || exit_code=1
            ;;
        "regression")
            run_test "regression" "regression" "回归测试" $verbose || exit_code=1
            ;;
        *)
            echo -e "${RED}❌ 未知测试模式: $test_mode${NC}"
            exit_code=1
            ;;
    esac
    
    # 生成报告
    generate_report
    
    # 计算执行时间
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # 显示总结
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    if [ $exit_code -eq 0 ]; then
        echo -e "${CYAN}║${GREEN}                    🎉 测试执行成功                           ${CYAN}║${NC}"
    else
        echo -e "${CYAN}║${RED}                    ❌ 测试执行失败                           ${CYAN}║${NC}"
    fi
    echo -e "${CYAN}║                                                              ║${NC}"
    echo -e "${CYAN}║${NC}  执行时间: ${duration}秒                                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  测试模式: ${test_mode}                                      ${CYAN}║${NC}"
    if [ "$COVERAGE" = true ]; then
        echo -e "${CYAN}║${NC}  覆盖率报告: coverage/lcov-report/index.html                ${CYAN}║${NC}"
    fi
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    
    exit $exit_code
}

# 执行主函数
main "$@"