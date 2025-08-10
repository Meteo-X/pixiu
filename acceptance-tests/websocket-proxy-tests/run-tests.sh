#!/bin/bash

# WebSocket代理测试套件运行脚本
# 提供多种测试运行模式和配置选项

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
TEST_MODE="all"
COVERAGE_MODE="false"
VERBOSE_MODE="false"
WATCH_MODE="false"
SEQUENTIAL_MODE="false"
PERFORMANCE_MODE="false"
OUTPUT_DIR="./reports"
LOG_LEVEL="info"

# 显示帮助信息
show_help() {
    echo -e "${BLUE}WebSocket代理测试套件运行脚本${NC}"
    echo ""
    echo "使用方法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help              显示此帮助信息"
    echo "  -m, --mode <mode>       测试模式 (all|connection|forwarding|subscription|performance|integration|fault)"
    echo "  -c, --coverage          启用代码覆盖率收集"
    echo "  -v, --verbose           详细输出模式"
    echo "  -w, --watch             监视模式（文件变化时自动重新运行）"
    echo "  -s, --sequential        顺序执行测试（不并行）"
    echo "  -p, --performance       启用性能基准测试模式"
    echo "  -o, --output <dir>      测试报告输出目录 (默认: ./reports)"
    echo "  -l, --log-level <level> 日志级别 (debug|info|warn|error, 默认: info)"
    echo ""
    echo "测试模式说明:"
    echo "  all           - 运行所有测试"
    echo "  connection    - 连接管理测试"
    echo "  forwarding    - 消息转发测试"
    echo "  subscription  - 订阅管理测试"
    echo "  performance   - 性能和负载测试"
    echo "  integration   - 集成测试"
    echo "  fault         - 故障处理测试"
    echo ""
    echo "示例:"
    echo "  $0 --mode connection --coverage        # 运行连接测试并收集覆盖率"
    echo "  $0 --mode performance --sequential     # 顺序运行性能测试"
    echo "  $0 --watch --verbose                   # 监视模式，详细输出"
    echo "  $0 --mode all --coverage --output ./reports  # 完整测试，输出到指定目录"
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -m|--mode)
            TEST_MODE="$2"
            shift 2
            ;;
        -c|--coverage)
            COVERAGE_MODE="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE_MODE="true"
            shift
            ;;
        -w|--watch)
            WATCH_MODE="true"
            shift
            ;;
        -s|--sequential)
            SEQUENTIAL_MODE="true"
            shift
            ;;
        -p|--performance)
            PERFORMANCE_MODE="true"
            shift
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -l|--log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}错误: 未知参数 $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# 创建输出目录
mkdir -p "$OUTPUT_DIR"
mkdir -p "./logs"

# 设置时间戳
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

echo -e "${BLUE}🚀 启动WebSocket代理测试套件${NC}"
echo -e "${YELLOW}测试配置:${NC}"
echo "  模式: $TEST_MODE"
echo "  覆盖率: $COVERAGE_MODE"
echo "  详细模式: $VERBOSE_MODE"
echo "  监视模式: $WATCH_MODE"
echo "  顺序执行: $SEQUENTIAL_MODE"
echo "  性能模式: $PERFORMANCE_MODE"
echo "  输出目录: $OUTPUT_DIR"
echo "  日志级别: $LOG_LEVEL"
echo ""

# 检查依赖
echo -e "${YELLOW}检查依赖...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi

# 检查 package.json
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json 文件不存在${NC}"
    exit 1
fi

# 安装依赖（如果需要）
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo -e "${YELLOW}📦 安装依赖...${NC}"
    npm install
fi

# 构建Jest命令
JEST_CMD="npx jest --config=jest.config.js"

# 添加测试模式参数
case $TEST_MODE in
    "connection")
        JEST_CMD="$JEST_CMD --testPathPattern=connection"
        ;;
    "forwarding")
        JEST_CMD="$JEST_CMD --testPathPattern=forwarding"
        ;;
    "subscription")
        JEST_CMD="$JEST_CMD --testPathPattern=subscription"
        ;;
    "performance")
        JEST_CMD="$JEST_CMD --testPathPattern=performance"
        PERFORMANCE_MODE="true"
        ;;
    "integration")
        JEST_CMD="$JEST_CMD --testPathPattern=integration"
        ;;
    "fault")
        JEST_CMD="$JEST_CMD --testPathPattern=fault"
        ;;
    "all")
        # 运行所有测试，不需要额外参数
        ;;
    *)
        echo -e "${RED}❌ 无效的测试模式: $TEST_MODE${NC}"
        echo "有效模式: all, connection, forwarding, subscription, performance, integration, fault"
        exit 1
        ;;
esac

# 添加其他参数
if [ "$COVERAGE_MODE" = "true" ]; then
    JEST_CMD="$JEST_CMD --coverage --coverageDirectory=$OUTPUT_DIR/coverage"
fi

if [ "$VERBOSE_MODE" = "true" ]; then
    JEST_CMD="$JEST_CMD --verbose"
fi

if [ "$WATCH_MODE" = "true" ]; then
    JEST_CMD="$JEST_CMD --watch"
fi

if [ "$SEQUENTIAL_MODE" = "true" ]; then
    JEST_CMD="$JEST_CMD --runInBand --maxWorkers=1"
fi

# 性能模式配置
if [ "$PERFORMANCE_MODE" = "true" ]; then
    export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
    JEST_CMD="$JEST_CMD --testTimeout=120000 --maxWorkers=2"
fi

# 设置环境变量
export LOG_LEVEL="$LOG_LEVEL"
export TEST_OUTPUT_DIR="$OUTPUT_DIR"
export TEST_MODE="$TEST_MODE"

# 创建日志文件
LOG_FILE="./logs/test-run-$TIMESTAMP.log"

echo -e "${YELLOW}🧪 开始运行测试...${NC}"
echo "日志文件: $LOG_FILE"
echo ""

# 运行测试
if [ "$WATCH_MODE" = "true" ]; then
    # 监视模式不记录到文件
    eval $JEST_CMD
else
    # 运行测试并记录日志
    eval $JEST_CMD 2>&1 | tee "$LOG_FILE"
    
    # 检查测试结果
    TEST_EXIT_CODE=${PIPESTATUS[0]}
    
    if [ $TEST_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ 测试执行成功！${NC}"
    else
        echo -e "${RED}❌ 测试执行失败！退出代码: $TEST_EXIT_CODE${NC}"
    fi
    
    # 生成测试摘要
    if [ -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}📊 生成测试摘要...${NC}"
        
        SUMMARY_FILE="$OUTPUT_DIR/test-summary-$TIMESTAMP.txt"
        
        echo "WebSocket代理测试套件执行摘要" > "$SUMMARY_FILE"
        echo "===============================" >> "$SUMMARY_FILE"
        echo "执行时间: $(date)" >> "$SUMMARY_FILE"
        echo "测试模式: $TEST_MODE" >> "$SUMMARY_FILE"
        echo "配置: 覆盖率=$COVERAGE_MODE, 详细=$VERBOSE_MODE, 顺序=$SEQUENTIAL_MODE" >> "$SUMMARY_FILE"
        echo "退出代码: $TEST_EXIT_CODE" >> "$SUMMARY_FILE"
        echo "" >> "$SUMMARY_FILE"
        
        # 提取测试结果统计
        if grep -q "Tests:" "$LOG_FILE"; then
            echo "测试统计:" >> "$SUMMARY_FILE"
            grep "Tests:" "$LOG_FILE" | tail -1 >> "$SUMMARY_FILE"
            echo "" >> "$SUMMARY_FILE"
        fi
        
        # 提取覆盖率信息
        if [ "$COVERAGE_MODE" = "true" ] && grep -q "All files" "$LOG_FILE"; then
            echo "覆盖率统计:" >> "$SUMMARY_FILE"
            grep -A 5 "All files" "$LOG_FILE" >> "$SUMMARY_FILE"
            echo "" >> "$SUMMARY_FILE"
        fi
        
        # 提取失败的测试
        if grep -q "FAIL" "$LOG_FILE"; then
            echo "失败的测试:" >> "$SUMMARY_FILE"
            grep "FAIL" "$LOG_FILE" >> "$SUMMARY_FILE"
            echo "" >> "$SUMMARY_FILE"
        fi
        
        echo "摘要已保存到: $SUMMARY_FILE"
    fi
    
    # 如果启用了覆盖率，显示覆盖率报告位置
    if [ "$COVERAGE_MODE" = "true" ]; then
        COVERAGE_HTML="$OUTPUT_DIR/coverage/lcov-report/index.html"
        if [ -f "$COVERAGE_HTML" ]; then
            echo -e "${GREEN}📈 覆盖率报告已生成: $COVERAGE_HTML${NC}"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}📁 输出文件:${NC}"
    echo "  日志文件: $LOG_FILE"
    echo "  报告目录: $OUTPUT_DIR"
    
    if [ -d "$OUTPUT_DIR/coverage" ]; then
        echo "  覆盖率报告: $OUTPUT_DIR/coverage/lcov-report/index.html"
    fi
    
    exit $TEST_EXIT_CODE
fi