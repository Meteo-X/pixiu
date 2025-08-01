#!/bin/bash

# Fix Google Cloud IAM Permissions Script
# This script fixes the IAM role assignments for the Pixiu service account

set -e

echo "🔧 Fixing Google Cloud IAM permissions for Pixiu Trading System"
echo "=============================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Get current project ID
PROJECT_ID=$(gcloud config get-value project)

if [ -z "$PROJECT_ID" ]; then
    print_error "No Google Cloud project is currently set. Please run 'gcloud config set project YOUR_PROJECT_ID'"
    exit 1
fi

print_status "Current project: $PROJECT_ID"

# Service account details
SERVICE_ACCOUNT_NAME="pixiu-trading-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

print_step "Checking if service account exists..."
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" &>/dev/null; then
    print_status "Service account exists: $SERVICE_ACCOUNT_EMAIL"
else
    print_error "Service account does not exist: $SERVICE_ACCOUNT_EMAIL"
    print_status "Creating service account..."
    gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
        --display-name="Pixiu Trading System Service Account" \
        --description="Service account for Pixiu trading system components"
fi

# Remove old incorrect roles if they exist (this might fail, which is okay)
print_step "Removing old incorrect roles (if they exist)..."
OLD_ROLES=(
    "roles/monitoring.writer"
    "roles/logging.writer" 
    "roles/secretmanager.accessor"
)

for role in "${OLD_ROLES[@]}"; do
    print_status "Attempting to remove old role: $role"
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$role" 2>/dev/null || print_warning "Role $role was not assigned (this is expected)"
done

# Grant correct permissions
print_step "Granting correct IAM roles..."
CORRECT_ROLES=(
    "roles/pubsub.publisher"
    "roles/pubsub.subscriber"
    "roles/monitoring.metricWriter"
    "roles/logging.logWriter"
    "roles/secretmanager.secretAccessor"
)

for role in "${CORRECT_ROLES[@]}"; do
    print_status "Granting role: $role"
    if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$role"; then
        print_status "✅ Successfully granted $role"
    else
        print_error "❌ Failed to grant $role"
    fi
done

# Verify the roles were assigned
print_step "Verifying IAM role assignments..."
print_status "Current IAM bindings for service account:"

gcloud projects get-iam-policy "$PROJECT_ID" \
    --flatten="bindings[].members" \
    --format="table(bindings.role)" \
    --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT_EMAIL"

# Test basic functionality
print_step "Testing service account functionality..."

# Test Pub/Sub access
print_status "Testing Pub/Sub access..."
if gcloud pubsub topics list --impersonate-service-account="$SERVICE_ACCOUNT_EMAIL" &>/dev/null; then
    print_status "✅ Pub/Sub access verified"
else
    print_warning "⚠️  Pub/Sub access test failed"
fi

# Regenerate service account key if needed
print_step "Checking service account key..."
KEY_FILE="$HOME/.config/gcloud/pixiu-trading-key.json"

if [ -f "$KEY_FILE" ]; then
    print_status "Service account key already exists: $KEY_FILE"
    
    # Check if key is valid
    if GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE" gcloud auth application-default print-access-token &>/dev/null; then
        print_status "✅ Service account key is valid"
    else
        print_warning "⚠️  Service account key appears invalid, regenerating..."
        gcloud iam service-accounts keys create "$KEY_FILE" \
            --iam-account="$SERVICE_ACCOUNT_EMAIL"
        print_status "✅ New service account key created"
    fi
else
    print_status "Creating new service account key..."
    mkdir -p "$(dirname "$KEY_FILE")"
    gcloud iam service-accounts keys create "$KEY_FILE" \
        --iam-account="$SERVICE_ACCOUNT_EMAIL"
    print_status "✅ Service account key created: $KEY_FILE"
fi

# Update environment file
print_step "Updating environment configuration..."
ENV_FILE="/workspaces/pixiu/.env.gcloud"

# Create or update the environment file
cat > "$ENV_FILE" << EOF
# Google Cloud Configuration for Pixiu Trading System
# Updated on $(date)

GOOGLE_CLOUD_PROJECT=$PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=$KEY_FILE
PUBSUB_EMULATOR_HOST=
GOOGLE_CLOUD_REGION=us-central1

# Pub/Sub Configuration
PUBSUB_TOPIC_PREFIX=market-data
PUBSUB_SUBSCRIPTION_PREFIX=pixiu

# Service Account
SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT_EMAIL

# Development vs Production
NODE_ENV=development
LOG_LEVEL=info
EOF

print_status "Environment configuration updated: $ENV_FILE"

echo ""
echo "🎉 IAM permissions have been fixed!"
echo "=================================="
echo ""
echo "✅ Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "✅ Key File: $KEY_FILE"
echo "✅ Environment Config: $ENV_FILE"
echo ""
echo "Next steps:"
echo "1. Source the environment variables:"
echo "   source $ENV_FILE"
echo ""
echo "2. Test the Google Cloud connection:"
echo "   cd /workspaces/pixiu/services/adapters/binance-adapter"
echo "   npm run test:gcloud"
echo ""
print_warning "Remember: Keep your service account key secure!"