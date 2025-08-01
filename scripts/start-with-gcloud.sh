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
