# Cloud SQL Configuration with App-Factory

This application is configured to work with Google Cloud SQL (PostgreSQL) when deployed to Cloud Run, following the app-factory pattern.

## Database Connection Modes

The application supports three connection modes:

### 1. Cloud Run with Cloud SQL (Production)
When deployed to Cloud Run, the app connects to Cloud SQL via Unix socket:
- **INSTANCE_CONNECTION_NAME**: `project-id:region:instance-name`
- **DB_USER**: Database username (from Secret Manager)
- **DB_PASS**: Database password (from Secret Manager)
- **DB_NAME**: Database name (from Secret Manager)

### 2. Local Development with Connection String
For local development using a connection string:
- **DATABASE_URL**: `postgresql://username:password@localhost:5432/hrx`

### 3. Local Development with Direct Connection
For local development with individual parameters:
- **DB_HOST**: `localhost`
- **DB_PORT**: `5432`
- **DB_USER**: `postgres`
- **DB_PASS**: Your password
- **DB_NAME**: `hrx`

## GCP Secret Manager Setup

The following secrets need to be created in GCP Secret Manager:

```bash
# Database credentials for Cloud SQL
echo -n "postgres" | gcloud secrets create hrx-db-user --data-file=-
echo -n "your-secure-password" | gcloud secrets create hrx-db-pass --data-file=-
echo -n "hrx" | gcloud secrets create hrx-db-name --data-file=-

# Application secrets
echo -n "your-jwt-secret" | gcloud secrets create hrx-jwt-secret --data-file=-
echo -n "your-openai-key" | gcloud secrets create hrx-openai-key --data-file=-
```

## Cloud SQL Instance Setup

1. Create a Cloud SQL instance:
```bash
gcloud sql instances create hrx-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=me-central1 \
  --root-password=your-root-password
```

2. Create the database:
```bash
gcloud sql databases create hrx --instance=hrx-db
```

3. Update the `_INSTANCE_CONNECTION_NAME` in `cloudbuild.yaml`:
```yaml
_INSTANCE_CONNECTION_NAME: 'your-project-id:me-central1:hrx-db'
```

## Cloud Run IAM Permissions

The Cloud Run service account needs permission to access Cloud SQL:

```bash
# Get the service account email
SERVICE_ACCOUNT=$(gcloud run services describe hrx-training --region=me-central1 --format="value(spec.template.spec.serviceAccountName)")

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client"
```

## Local Development Setup

For local development, create a `.env` file in the `backend` directory:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Use connection string for local PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/hrx

JWT_SECRET=your-local-jwt-secret
OPENAI_API_KEY=your-openai-api-key
```

## Database Initialization

After setting up the database, run migrations:

```bash
cd backend
npm run migrate
npm run seed  # Optional: seed initial data
```

## Testing the Connection

The application will test the database connection on startup and log:
- ✅ Database connected successfully
- ❌ Database connection failed (with error details)

## Deployment

The application automatically deploys to Cloud Run with Cloud SQL when you push to your repository:

1. Cloud Build builds the Docker image
2. Pushes to Container Registry
3. Deploys to Cloud Run with:
   - Cloud SQL instance connection
   - Environment variables from Secret Manager
   - Proper IAM permissions

## App-Factory Integration

This setup follows the app-factory MCP server pattern:
- Uses PostgreSQL as the database (`needsDB: true`)
- Deploys to Cloud Run
- Connects via Cloud SQL Unix socket in production
- Supports local development with connection strings

