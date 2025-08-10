#!/bin/bash

# Exchange Collector 重构测试策略执行脚本
# 执行完整的重构测试套件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${TEST_DIR}/reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${REPORT_DIR}/comprehensive_test_report_${TIMESTAMP}.html"

# 创建报告目录
mkdir -p "${REPORT_DIR}"

echo -e "${BLUE}🚀 Exchange Collector 重构测试策略执行开始${NC}"
echo "测试目录: ${TEST_DIR}"
echo "报告目录: ${REPORT_DIR}"
echo "=================================="

# 检查环境
check_environment() {
    echo -e "${YELLOW}📋 检查测试环境...${NC}"
    
    # 检查Node.js版本
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js 未安装${NC}"
        exit 1
    fi
    
    NODE_VERSION=$(node -v)
    echo "✅ Node.js版本: ${NODE_VERSION}"
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm 未安装${NC}"
        exit 1
    fi
    
    NPM_VERSION=$(npm -v)
    echo "✅ npm版本: ${NPM_VERSION}"
    
    # 检查Jest
    cd "${TEST_DIR}"
    if ! npm list jest &> /dev/null; then
        echo -e "${YELLOW}⚠️  Jest 未安装，正在安装依赖...${NC}"
        npm install
    fi
    
    echo "✅ 测试环境检查完成"
    echo ""
}

# 运行回归测试
run_regression_tests() {
    echo -e "${BLUE}🔄 执行回归测试套件...${NC}"
    
    local start_time=$(date +%s)
    local test_result=0
    
    cd "${TEST_DIR}"
    
    if npm run test:regression -- --coverage --coverageDirectory="${REPORT_DIR}/regression-coverage" --json --outputFile="${REPORT_DIR}/regression-results.json" 2>&1; then
        echo -e "${GREEN}✅ 回归测试通过${NC}"
    else
        echo -e "${RED}❌ 回归测试失败${NC}"
        test_result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "执行时间: ${duration}秒"
    echo ""
    
    return $test_result
}

# 运行性能测试
run_performance_tests() {
    echo -e "${BLUE}⚡ 执行性能测试套件...${NC}"
    
    local start_time=$(date +%s)
    local test_result=0
    
    cd "${TEST_DIR}"
    
    # 设置性能测试环境变量
    export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
    
    if npm run test:performance -- --json --outputFile="${REPORT_DIR}/performance-results.json" 2>&1; then
        echo -e "${GREEN}✅ 性能测试通过${NC}"
    else
        echo -e "${RED}❌ 性能测试失败${NC}"
        test_result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "执行时间: ${duration}秒"
    echo ""
    
    return $test_result
}

# 运行集成测试
run_integration_tests() {
    echo -e "${BLUE}🔗 执行集成测试套件...${NC}"
    
    local start_time=$(date +%s)
    local test_result=0
    
    cd "${TEST_DIR}"
    
    if npm run test:integration -- --json --outputFile="${REPORT_DIR}/integration-results.json" 2>&1; then
        echo -e "${GREEN}✅ 集成测试通过${NC}"
    else
        echo -e "${RED}❌ 集成测试失败${NC}"
        test_result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "执行时间: ${duration}秒"
    echo ""
    
    return $test_result
}

# 运行单元测试
run_unit_tests() {
    echo -e "${BLUE}🧪 执行单元测试套件...${NC}"
    
    local start_time=$(date +%s)
    local test_result=0
    
    cd "${TEST_DIR}"
    
    if npm run test:unit -- --coverage --coverageDirectory="${REPORT_DIR}/unit-coverage" --json --outputFile="${REPORT_DIR}/unit-results.json" 2>&1; then
        echo -e "${GREEN}✅ 单元测试通过${NC}"
    else
        echo -e "${RED}❌ 单元测试失败${NC}"
        test_result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "执行时间: ${duration}秒"
    echo ""
    
    return $test_result
}

# 运行风险缓解测试
run_risk_mitigation_tests() {
    echo -e "${BLUE}🛡️ 执行风险缓解测试套件...${NC}"
    
    local start_time=$(date +%s)
    local test_result=0
    
    cd "${TEST_DIR}"
    
    if npm run test:risk-mitigation -- --json --outputFile="${REPORT_DIR}/risk-mitigation-results.json" 2>&1; then
        echo -e "${GREEN}✅ 风险缓解测试通过${NC}"
    else
        echo -e "${RED}❌ 风险缓解测试失败${NC}"
        test_result=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "执行时间: ${duration}秒"
    echo ""
    
    return $test_result
}

# 运行阶段性测试
run_phase_tests() {
    echo -e "${BLUE}🔄 执行阶段性重构测试...${NC}"
    
    local phases=("phase1" "phase2" "phase3")
    local overall_result=0
    
    for phase in "${phases[@]}"; do
        echo -e "${YELLOW}执行 ${phase} 测试...${NC}"
        
        local start_time=$(date +%s)
        
        cd "${TEST_DIR}"
        
        if npm run "test:${phase}" -- --json --outputFile="${REPORT_DIR}/${phase}-results.json" 2>&1; then
            echo -e "${GREEN}✅ ${phase} 测试通过${NC}"
        else
            echo -e "${RED}❌ ${phase} 测试失败${NC}"
            overall_result=1
        fi
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        echo "${phase} 执行时间: ${duration}秒"
    done
    
    echo ""
    return $overall_result
}

# 生成测试报告
generate_report() {
    echo -e "${BLUE}📊 生成综合测试报告...${NC}"
    
    cd "${TEST_DIR}"
    
    # 运行报告生成脚本
    if npm run test:report 2>&1; then
        echo -e "${GREEN}✅ 测试报告生成成功${NC}"
        echo "报告位置: ${REPORT_FILE}"
    else
        echo -e "${YELLOW}⚠️  测试报告生成失败，但测试已完成${NC}"
    fi
}

# 检查测试结果
check_test_results() {
    local results_dir="${REPORT_DIR}"
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    echo -e "${BLUE}📈 分析测试结果...${NC}"
    
    # 分析JSON结果文件
    for result_file in "${results_dir}"/*-results.json; do
        if [[ -f "$result_file" ]]; then
            local file_tests=$(cat "$result_file" | jq -r '.numTotalTests // 0' 2>/dev/null || echo "0")
            local file_passed=$(cat "$result_file" | jq -r '.numPassedTests // 0' 2>/dev/null || echo "0")
            local file_failed=$(cat "$result_file" | jq -r '.numFailedTests // 0' 2>/dev/null || echo "0")
            
            total_tests=$((total_tests + file_tests))
            passed_tests=$((passed_tests + file_passed))
            failed_tests=$((failed_tests + file_failed))
        fi
    done
    
    echo "=================================="
    echo -e "${BLUE}📋 测试结果汇总${NC}"
    echo "=================================="
    echo "总测试数: ${total_tests}"
    echo -e "通过测试: ${GREEN}${passed_tests}${NC}"
    echo -e "失败测试: ${RED}${failed_tests}${NC}"
    
    if [[ $total_tests -gt 0 ]]; then
        local success_rate=$((passed_tests * 100 / total_tests))
        echo "成功率: ${success_rate}%"
        
        if [[ $success_rate -ge 95 ]]; then
            echo -e "${GREEN}🎉 测试成功率优秀 (≥95%)${NC}"
        elif [[ $success_rate -ge 85 ]]; then
            echo -e "${YELLOW}⚠️  测试成功率良好 (≥85%)${NC}"
        else
            echo -e "${RED}❌ 测试成功率需要改进 (<85%)${NC}"
        fi
    fi
    
    echo "=================================="
}

# 清理测试环境
cleanup() {
    echo -e "${YELLOW}🧹 清理测试环境...${NC}"
    
    # 清理临时文件
    find "${TEST_DIR}" -name "*.tmp" -delete 2>/dev/null || true
    find "${TEST_DIR}" -name ".DS_Store" -delete 2>/dev/null || true
    
    # 清理Jest缓存
    cd "${TEST_DIR}"
    if command -v jest &> /dev/null; then
        jest --clearCache 2>/dev/null || true
    fi
    
    echo "✅ 清理完成"
}

# 主函数
main() {
    local overall_result=0
    local start_time=$(date +%s)
    
    echo -e "${BLUE}🚀 开始执行完整重构测试策略${NC}"
    echo "时间: $(date)"
    echo ""
    
    # 检查环境
    check_environment
    
    # 运行各种测试套件
    run_regression_tests || overall_result=1
    run_performance_tests || overall_result=1
    run_integration_tests || overall_result=1
    run_unit_tests || overall_result=1
    run_risk_mitigation_tests || overall_result=1
    run_phase_tests || overall_result=1
    
    # 生成报告
    generate_report
    
    # 检查结果
    check_test_results
    
    # 清理
    cleanup
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    local duration_minutes=$((total_duration / 60))
    local duration_seconds=$((total_duration % 60))
    
    echo ""
    echo "=================================="
    echo -e "${BLUE}🏁 测试执行完成${NC}"
    echo "=================================="
    echo "总执行时间: ${duration_minutes}分${duration_seconds}秒"
    echo "结果报告: ${REPORT_DIR}"
    
    if [[ $overall_result -eq 0 ]]; then
        echo -e "${GREEN}🎉 所有测试套件执行成功！${NC}"
        echo -e "${GREEN}✅ Exchange Collector重构测试策略验证通过${NC}"
    else
        echo -e "${RED}❌ 部分测试套件执行失败${NC}"
        echo -e "${RED}🚨 请检查测试报告并修复问题${NC}"
    fi
    
    echo "结束时间: $(date)"
    
    exit $overall_result
}

# 处理中断信号
trap cleanup EXIT INT TERM

# 执行主函数
main "$@"