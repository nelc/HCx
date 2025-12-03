# App-Factory MCP Server Integration

This document explains how the HRx application has been configured to work with the **app-factory MCP server** pattern for Google Cloud Run deployment with Cloud SQL PostgreSQL.

## What is App-Factory?

The app-factory MCP server is a tool that helps create production-ready applications that deploy to Google Cloud Run with optional PostgreSQL database support (Cloud SQL).

## Integration Status

✅ **The application is now fully integrated with the app-factory pattern.**

### Key Changes Made

#### 1. Database Connection Configuration (`backend/src/db/index.js`)

The database connection now supports three modes:

**🔵 Cloud Run with Cloud SQL (Production)**
- Connects via Unix socket: `/cloudsql/${INSTANCE_CONNECTION_NAME}`
- Uses environment variables: `DB_USER`, `DB_PASS`, `DB_NAME`, `INSTANCE_CONNECTION_NAME`
- No SSL required (local Unix socket)

**🟢 Local Development with Connection String**
- Uses `DATABASE_URL` environment variable
- Example: `postgresql://user:pass@localhost:5432/hrx`
- SSL configured with `rejectUnauthorized: false`

**🟡 Direct Connection (Fallback)**
- Uses individual parameters: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`

#### 2. Cloud Build Configuration (`cloudbuild.yaml`)

Updated to support Cloud SQL:
- Added `--add-cloudsql-instances` flag to connect to Cloud SQL
- Changed secrets from single `DATABASE_URL` to individual: `DB_USER`, `DB_PASS`, `DB_NAME`
- Added `INSTANCE_CONNECTION_NAME` environment variable
- Added substitution variable `_INSTANCE_CONNECTION_NAME`

#### 3. Documentation

- **CLOUD_SQL_SETUP.md**: Comprehensive guide for Cloud SQL setup
- **README.md**: Updated with app-factory pattern references
- **APP_FACTORY_INTEGRATION.md**: This document

## App-Factory MCP Server Tools

The app-factory MCP server provides two tools:

### 1. Generate App Prompt
```javascript
mcp_app-factory_generate_app_prompt({
  appName: "HRx Training System",
  features: [
    "User authentication and roles",
    "Test builder and assignments",
    "AI-powered response analysis",
    "Multi-level dashboards"
  ],
  needsDB: true,  // ✅ PostgreSQL Cloud SQL
  needsFiles: false
})
```

This tool generates a customized AI prompt for building Cloud Run apps.

### 2. Create GitHub Repository
```javascript
mcp_app-factory_create_github_repo({
  repoName: "hrx-training",
  description: "HR Training Needs Assessment System with AI",
  isPrivate: true
})
```

This tool creates a GitHub repository in the `nelc` organization with automatic GCP deployment credentials.

## Environment Variables Reference

### Local Development (.env in backend folder)

```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173

# Use connection string for local PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/hrx

JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=your-openai-api-key
```

### Cloud Run (from GCP Secret Manager)

These are automatically injected by Cloud Run:

```env
NODE_ENV=production
PORT=8080

# Cloud SQL Connection
INSTANCE_CONNECTION_NAME=project-id:region:instance-name
DB_USER=postgres
DB_PASS=your-secure-password
DB_NAME=hrx

# Application secrets
JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=your-openai-api-key
```

## Database Connection Logic

The application automatically detects which connection mode to use:

```javascript
if (INSTANCE_CONNECTION_NAME exists) {
  // Cloud Run with Cloud SQL
  → Connect via Unix socket
} else if (DATABASE_URL exists) {
  // Connection string
  → Use connection string
} else {
  // Direct connection
  → Use individual parameters
}
```

## Deployment Workflow

1. **Code Push**: Push code to GitHub repository
2. **Cloud Build Trigger**: Automatically starts build process
3. **Docker Build**: Builds container image with frontend and backend
4. **Push to GCR**: Pushes image to Google Container Registry
5. **Deploy to Cloud Run**: 
   - Connects to Cloud SQL instance
   - Injects secrets from Secret Manager
   - Deploys with proper IAM permissions

## Required GCP Setup

### 1. Cloud SQL Instance
```bash
gcloud sql instances create hrx-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=me-central1
```

### 2. Database Creation
```bash
gcloud sql databases create hrx --instance=hrx-db
```

### 3. Secret Manager Secrets
```bash
echo -n "postgres" | gcloud secrets create hrx-db-user --data-file=-
echo -n "secure-password" | gcloud secrets create hrx-db-pass --data-file=-
echo -n "hrx" | gcloud secrets create hrx-db-name --data-file=-
echo -n "jwt-secret" | gcloud secrets create hrx-jwt-secret --data-file=-
echo -n "openai-key" | gcloud secrets create hrx-openai-key --data-file=-
```

### 4. IAM Permissions
```bash
# Cloud Run service account needs Cloud SQL Client role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/cloudsql.client"
```

## Verification

The application includes automatic connection testing on startup:

✅ **Success**: `✅ Database connected successfully at [timestamp]`
❌ **Failure**: `❌ Database connection failed: [error message]`

Check Cloud Run logs:
```bash
gcloud run logs read hrx-training --region=me-central1
```

## Benefits of App-Factory Pattern

1. **🚀 Production-Ready**: Configured for Cloud Run deployment
2. **🔒 Secure**: Uses Secret Manager for credentials
3. **📈 Scalable**: Cloud SQL with connection pooling
4. **🔄 Flexible**: Supports local and cloud environments
5. **⚡ Fast**: Unix socket connection in production
6. **🛠️ Maintainable**: Clear separation of environments

## Next Steps

If you want to create a new GitHub repository with deployment credentials:

1. Ensure you have GitHub CLI installed and authenticated
2. Use the app-factory MCP tool:
   ```
   Create a new GitHub repository for this app using app-factory
   ```

This will:
- Create a repo in the `nelc` organization
- Configure deployment credentials
- Provide push instructions

## Support

For detailed Cloud SQL setup, see [CLOUD_SQL_SETUP.md](./CLOUD_SQL_SETUP.md)

For general project information, see [README.md](./README.md)

