# 🚀 Deployment Checklist - App-Factory Pattern

Use this checklist to deploy your HRx application to Google Cloud Run with Cloud SQL.

## ✅ Pre-Deployment Checklist

### 1. GCP Project Setup
- [ ] GCP project created
- [ ] Billing enabled
- [ ] Required APIs enabled:
  - [ ] Cloud Run API
  - [ ] Cloud SQL Admin API
  - [ ] Cloud Build API
  - [ ] Secret Manager API
  - [ ] Container Registry API

### 2. Cloud SQL Database
- [ ] Cloud SQL instance created (`hrx-db`)
- [ ] Database created (`hrx`)
- [ ] Root password set
- [ ] Instance connection name noted: `PROJECT_ID:me-central1:hrx-db`

```bash
# Create Cloud SQL instance
gcloud sql instances create hrx-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=me-central1 \
  --root-password=YOUR_ROOT_PASSWORD

# Create database
gcloud sql databases create hrx --instance=hrx-db

# Get connection name
gcloud sql instances describe hrx-db --format="value(connectionName)"
```

### 3. Secret Manager Setup
- [ ] `hrx-db-user` secret created
- [ ] `hrx-db-pass` secret created
- [ ] `hrx-db-name` secret created
- [ ] `hrx-jwt-secret` secret created
- [ ] `hrx-openai-key` secret created

```bash
# Database credentials
echo -n "postgres" | gcloud secrets create hrx-db-user --data-file=-
echo -n "YOUR_SECURE_PASSWORD" | gcloud secrets create hrx-db-pass --data-file=-
echo -n "hrx" | gcloud secrets create hrx-db-name --data-file=-

# Application secrets
echo -n "YOUR_JWT_SECRET" | gcloud secrets create hrx-jwt-secret --data-file=-
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create hrx-openai-key --data-file=-
```

### 4. Configuration Files
- [ ] `cloudbuild.yaml` - Instance connection name updated
- [ ] `Dockerfile` - No changes needed (already configured)
- [ ] `backend/src/db/index.js` - Already configured for app-factory pattern

### 5. Database Schema
- [ ] Schema migrations ready in `backend/src/db/schema.sql`
- [ ] Migrations will be run after first deployment

```bash
# After first deployment, run migrations via Cloud Run instance
gcloud run services proxy hrx-training --region=me-central1
# Then connect and run migrations
```

## 🔧 Configuration Updates Needed

### Update `cloudbuild.yaml`

Current substitution variable (line 34):
```yaml
_INSTANCE_CONNECTION_NAME: '${PROJECT_ID}:me-central1:hrx-db'
```

**If your Cloud SQL instance has a different name**, update it to:
```yaml
_INSTANCE_CONNECTION_NAME: 'YOUR_PROJECT_ID:me-central1:YOUR_INSTANCE_NAME'
```

## 🚀 Deployment

### First Time Deployment

1. **Connect to GCP Project**
```bash
gcloud config set project YOUR_PROJECT_ID
```

2. **Enable required APIs** (if not already done)
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com
```

3. **Deploy using Cloud Build**
```bash
cd /Users/hbinasfour/Desktop/HR
gcloud builds submit --config cloudbuild.yaml
```

4. **Grant IAM Permissions**
```bash
# Get the service account
SERVICE_ACCOUNT=$(gcloud run services describe hrx-training \
  --region=me-central1 \
  --format="value(spec.template.spec.serviceAccountName)")

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client"
```

5. **Run Database Migrations**

Connect to the Cloud SQL instance:
```bash
gcloud sql connect hrx-db --user=postgres
```

Then run the schema:
```sql
\c hrx
\i /path/to/backend/src/db/schema.sql
```

Or run migrations via the deployed Cloud Run service:
```bash
# Get Cloud Run URL
SERVICE_URL=$(gcloud run services describe hrx-training \
  --region=me-central1 \
  --format="value(status.url)")

echo "Service deployed at: $SERVICE_URL"
```

### Subsequent Deployments

Simply push to your repository or run:
```bash
gcloud builds submit --config cloudbuild.yaml
```

## ✅ Post-Deployment Verification

### 1. Check Cloud Run Service
```bash
gcloud run services list --region=me-central1
gcloud run services describe hrx-training --region=me-central1
```

### 2. Check Logs
```bash
# View logs
gcloud run logs read hrx-training --region=me-central1 --limit=50

# Stream logs
gcloud run logs tail hrx-training --region=me-central1
```

Look for:
- ✅ `Database connected successfully at [timestamp]`
- 🚀 `HRx Server running on port 8080`

### 3. Test Health Endpoint
```bash
SERVICE_URL=$(gcloud run services describe hrx-training \
  --region=me-central1 \
  --format="value(status.url)")

curl $SERVICE_URL/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-03T..."
}
```

### 4. Test Database Connection
```bash
# Login and test
curl -X POST $SERVICE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hrx.com","password":"password123"}'
```

## 🐛 Troubleshooting

### Issue: Database connection failed
**Check:**
- [ ] Cloud SQL instance is running
- [ ] Secrets are created and accessible
- [ ] IAM permissions granted
- [ ] Instance connection name is correct in `cloudbuild.yaml`

```bash
# Check instance status
gcloud sql instances describe hrx-db

# Check secrets
gcloud secrets versions access latest --secret=hrx-db-user
gcloud secrets versions access latest --secret=hrx-db-name
```

### Issue: Permission denied errors
**Grant Secret Manager permissions:**
```bash
# Get the Cloud Run service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Secret Manager accessor role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

### Issue: Cloud SQL connection timeout
**Check Cloud SQL proxy:**
```bash
# Test connection locally
cloud_sql_proxy -instances=YOUR_PROJECT_ID:me-central1:hrx-db=tcp:5432
```

## 📚 Documentation Reference

- **[CLOUD_SQL_SETUP.md](./CLOUD_SQL_SETUP.md)** - Detailed Cloud SQL configuration
- **[APP_FACTORY_INTEGRATION.md](./APP_FACTORY_INTEGRATION.md)** - App-factory pattern details
- **[README.md](./README.md)** - General project documentation

## 🎯 Quick Command Reference

```bash
# Deploy
gcloud builds submit --config cloudbuild.yaml

# View logs
gcloud run logs tail hrx-training --region=me-central1

# Get service URL
gcloud run services describe hrx-training --region=me-central1 --format="value(status.url)"

# Connect to database
gcloud sql connect hrx-db --user=postgres

# Redeploy (update secrets)
gcloud run services update hrx-training --region=me-central1
```

---

**Need help?** Check the logs first:
```bash
gcloud run logs read hrx-training --region=me-central1 --limit=100
```

