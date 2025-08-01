#!/bin/bash

# Google Cloud Setup Script for Pixiu Trading System
# This script helps configure Google Cloud SDK and create necessary resources

set -e

echo "🚀 Setting up Google Cloud for Pixiu Trading System"
echo "=================================================="

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

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed. Please install it first."
    exit 1
fi

print_status "gcloud CLI is installed: $(gcloud version --format='value(Google Cloud SDK)')"

# Prompt for project ID
print_step "Please enter your Google Cloud Project ID:"
echo "You can find this in the Google Cloud Console after creating your project."
echo "It should look like: pixiu-trading-123456"
read -p "Project ID: " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    print_error "Project ID cannot be empty"
    exit 1
fi

# Set the project
print_step "Setting Google Cloud project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

# Authenticate
print_step "Authenticating with Google Cloud..."
echo "This will open a browser window for authentication."
read -p "Press Enter to continue..."
gcloud auth login

# Set up application default credentials
print_step "Setting up Application Default Credentials..."
gcloud auth application-default login

# Enable required APIs
print_step "Enabling required Google Cloud APIs..."
APIS=(
    "pubsub.googleapis.com"
    "monitoring.googleapis.com"
    "logging.googleapis.com"
    "secretmanager.googleapis.com"
    "containerregistry.googleapis.com"
    "artifactregistry.googleapis.com"
)

for api in "${APIS[@]}"; do
    print_status "Enabling $api..."
    gcloud services enable "$api" || print_warning "Failed to enable $api (might already be enabled)"
done

# Create Pub/Sub topics for development
print_step "Creating Pub/Sub topics for development..."
TOPICS=(
    "market-data-trade-binance"
    "market-data-kline-binance"
    "market-data-ticker-binance"
)

for topic in "${TOPICS[@]}"; do
    print_status "Creating topic: $topic"
    gcloud pubsub topics create "$topic" || print_warning "Topic $topic might already exist"
done

# Create a service account for the application
print_step "Creating service account for Pixiu application..."
SERVICE_ACCOUNT_NAME="pixiu-trading-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="Pixiu Trading System Service Account" \
    --description="Service account for Pixiu trading system components" \
    || print_warning "Service account might already exist"

# Grant necessary permissions
print_step "Granting permissions to service account..."
ROLES=(
    "roles/pubsub.publisher"
    "roles/pubsub.subscriber"
    "roles/monitoring.metricWriter"
    "roles/logging.logWriter"
    "roles/secretmanager.secretAccessor"
)

for role in "${ROLES[@]}"; do
    print_status "Granting role: $role"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$role" || print_warning "Failed to grant $role"
done

# Create and download service account key
print_step "Creating service account key..."
KEY_FILE="$HOME/.config/gcloud/pixiu-trading-key.json"
mkdir -p "$(dirname "$KEY_FILE")"

gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SERVICE_ACCOUNT_EMAIL"

print_status "Service account key saved to: $KEY_FILE"

# Create environment configuration
print_step "Creating environment configuration..."
ENV_FILE="/workspaces/pixiu/.env.gcloud"

cat > "$ENV_FILE" << EOF
# Google Cloud Configuration for Pixiu Trading System
# Generated on $(date)

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

print_status "Environment configuration saved to: $ENV_FILE"

# Create a startup script that sources the environment
print_step "Creating development startup script..."
STARTUP_SCRIPT="/workspaces/pixiu/scripts/start-with-gcloud.sh"

cat > "$STARTUP_SCRIPT" << 'EOF'
#!/bin/bash

# Load Google Cloud environment variables
if [ -f "/workspaces/pixiu/.env.gcloud" ]; then
    export $(cat /workspaces/pixiu/.env.gcloud | grep -v '^#' | xargs)
    echo "✅ Loaded Google Cloud environment variables"
else
    echo "⚠️  Google Cloud environment file not found"
fi

# Start the application
exec "$@"
EOF

chmod +x "$STARTUP_SCRIPT"

# Test the setup
print_step "Testing Google Cloud setup..."

print_status "Testing gcloud authentication..."
gcloud auth list

print_status "Testing project access..."
gcloud projects describe "$PROJECT_ID" --format="value(projectId,name)"

print_status "Testing Pub/Sub access..."
gcloud pubsub topics list --filter="name:market-data" --format="value(name)"

print_status "Testing service account..."
gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --format="value(email,displayName)"

echo ""
echo "🎉 Google Cloud setup completed successfully!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Source the environment variables:"
echo "   source /workspaces/pixiu/.env.gcloud"
echo ""
echo "2. Test the setup with a simple Node.js script:"
echo "   cd /workspaces/pixiu/services/adapters/binance-adapter"
echo "   npm install"
echo "   node -e \"console.log(process.env.GOOGLE_CLOUD_PROJECT)\""
echo ""
echo "3. Run the Pub/Sub emulator for local development:"
echo "   gcloud beta emulators pubsub start --host-port=localhost:8085"
echo ""
echo "📝 Important files created:"
echo "   - Environment config: /workspaces/pixiu/.env.gcloud"
echo "   - Service account key: $KEY_FILE"
echo "   - Startup script: /workspaces/pixiu/scripts/start-with-gcloud.sh"
echo ""
print_warning "Keep your service account key secure and never commit it to version control!"