#!/bin/bash

# Exchange Collector Google Cloud 部署脚本
# 使用方法: ./deploy.sh [PROJECT_ID] [REGION]

set -e  # 遇到错误时停止

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 参数设置
PROJECT_ID=${1:-"pixiu-trading-dev"}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME="exchange-collector"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo -e "${BLUE}🚀 Starting Exchange Collector deployment to Google Cloud${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Region: ${REGION}${NC}"
echo ""

# 1. 验证 Google Cloud CLI
echo -e "${YELLOW}📋 Step 1: Verifying Google Cloud CLI...${NC}"
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Google Cloud CLI not found. Please install it first.${NC}"
    exit 1
fi

# 2. 设置项目
echo -e "${YELLOW}📋 Step 2: Setting up Google Cloud project...${NC}"
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# 3. 启用必要的服务
echo -e "${YELLOW}📋 Step 3: Enabling required Google Cloud services...${NC}"
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    pubsub.googleapis.com \
    monitoring.googleapis.com \
    logging.googleapis.com

# 4. 创建服务账号（如果不存在）
echo -e "${YELLOW}📋 Step 4: Setting up service account...${NC}"
SA_EMAIL="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe $SA_EMAIL &>/dev/null; then
    echo "Creating service account..."
    gcloud iam service-accounts create $SERVICE_NAME \
        --display-name="Exchange Collector Service Account" \
        --description="Service account for Exchange Collector on Cloud Run"
    
    # 添加必要的权限
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/pubsub.admin"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/monitoring.metricWriter"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/logging.logWriter"
else
    echo "Service account already exists."
fi

# 5. 构建和部署
echo -e "${YELLOW}📋 Step 5: Building and deploying application...${NC}"
echo "Starting Cloud Build..."

# 提交构建
gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_REGION=$REGION,_SERVICE_NAME=$SERVICE_NAME \
    .

# 6. 验证部署
echo -e "${YELLOW}📋 Step 6: Verifying deployment...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}❌ Failed to get service URL${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Service deployed successfully!${NC}"
echo -e "${GREEN}📱 Service URL: $SERVICE_URL${NC}"

# 7. 运行健康检查
echo -e "${YELLOW}📋 Step 7: Running health checks...${NC}"
sleep 10  # 等待服务启动

if curl -f -s "$SERVICE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Service might still be starting up. Check the logs:"
    echo "gcloud run services logs read $SERVICE_NAME --region=$REGION"
fi

# 8. 显示有用信息
echo ""
echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo ""
echo -e "${BLUE}📱 Application URLs:${NC}"
echo -e "   Frontend: $SERVICE_URL"
echo -e "   Health Check: $SERVICE_URL/health"
echo -e "   API: $SERVICE_URL/api/adapters"
echo -e "   WebSocket: ${SERVICE_URL/https:/wss:}/ws"
echo ""
echo -e "${BLUE}📊 Monitoring:${NC}"
echo -e "   Cloud Run Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/metrics?project=$PROJECT_ID"
echo -e "   Cloud Build History: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
echo -e "   Logs: gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo ""
echo -e "${BLUE}🔧 Management Commands:${NC}"
echo -e "   Update service: gcloud run deploy $SERVICE_NAME --image=$IMAGE_NAME:latest --region=$REGION"
echo -e "   View logs: gcloud run services logs read $SERVICE_NAME --region=$REGION --follow"
echo -e "   Scale service: gcloud run services update $SERVICE_NAME --region=$REGION --min-instances=1 --max-instances=10"
echo ""
echo -e "${GREEN}✨ Happy trading! 🚀${NC}"