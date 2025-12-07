#!/bin/bash

# Start Cloud SQL Proxy for local development
# This creates a local connection to the Cloud SQL instance

echo "🔌 Starting Cloud SQL Proxy..."
echo ""
echo "If you don't have Cloud SQL Proxy installed, install it with:"
echo "  brew install cloud-sql-proxy"
echo ""

# Start the proxy
cloud_sql_proxy \
  --instances=app-sandbox-factory:me-central2:app-factory-db=tcp:5432 \
  --credentials-file=path/to/your/service-account-key.json

# After the proxy is running, update your .env to use:
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=Hrxuser
# DB_PASS=lkdfvsdSDD565?
# DB_NAME=hrx

