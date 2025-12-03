# GitHub Actions Workflows

## Deploy to Cloud Run Workflow

This workflow automatically builds and deploys the HRx application to Google Cloud Run whenever code is pushed to the `main` branch.

### Required Organization Secrets

The following secrets must be configured in the nelc organization or repository settings:

#### GCP Authentication
- **`GCP_PROJECT_ID`** - The Google Cloud Platform project ID (e.g., `nelc-production-123456`)
- **`WIF_PROVIDER`** - Workload Identity Federation provider path
  - Format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`
- **`WIF_SERVICE_ACCOUNT`** - Service account email for deployment
  - Format: `github-actions@PROJECT_ID.iam.gserviceaccount.com`

#### Cloud SQL Configuration
- **`INSTANCE_CONNECTION_NAME`** - Cloud SQL instance connection name
  - Format: `PROJECT_ID:REGION:INSTANCE_NAME` (e.g., `nelc-prod:me-central1:hrx-db`)

#### Application Secrets (in GCP Secret Manager)
These secrets should exist in GCP Secret Manager and will be injected into Cloud Run:
- `hrx-db-user` - Database username
- `hrx-db-pass` - Database password
- `hrx-db-name` - Database name
- `hrx-jwt-secret` - JWT signing secret
- `hrx-openai-key` - OpenAI API key

### Workflow Triggers

- **Automatic**: Pushes to `main` branch
- **Manual**: Can be triggered manually from GitHub Actions UI using "workflow_dispatch"

### Deployment Steps

1. **Checkout code** - Gets the latest code from the repository
2. **Authenticate** - Authenticates with Google Cloud using Workload Identity
3. **Build** - Builds Docker image with frontend and backend
4. **Push** - Pushes image to Google Container Registry (GCR)
5. **Deploy** - Deploys to Cloud Run with all configurations

### Cloud Run Configuration

- **Port**: 8080
- **Memory**: 1 GB
- **CPU**: 1 vCPU
- **Min Instances**: 0 (scales to zero)
- **Max Instances**: 10
- **Timeout**: 300 seconds (5 minutes)
- **Platform**: Managed
- **Access**: Public (unauthenticated)

### Deployment URL

After successful deployment, the application will be available at:
- **Cloud Run URL**: Shown in deployment logs
- **Custom Domain**: https://learnub.futurex.sa/hrx-training (if configured)

### Monitoring Deployment

1. Go to: https://github.com/nelc/hrx-training/actions
2. Click on the latest workflow run
3. Monitor the build and deployment progress
4. Check deployment logs for any issues

### Local Testing Before Push

Before pushing to `main`, test locally:

```bash
# Build Docker image locally
docker build -t hrx-training:test .

# Run locally
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/hrx \
  -e JWT_SECRET=test-secret \
  hrx-training:test
```

### Troubleshooting

#### Authentication Failed
- Verify Workload Identity Federation is configured
- Check service account has necessary permissions
- Ensure secrets are set in organization/repository settings

#### Build Failed
- Check Dockerfile for errors
- Verify all dependencies are in package.json
- Check build logs for specific errors

#### Deployment Failed
- Verify Cloud SQL instance exists and is running
- Check Secret Manager secrets exist
- Ensure service account has Cloud Run Admin role

#### Database Connection Failed
- Verify `INSTANCE_CONNECTION_NAME` is correct
- Check database secrets in Secret Manager
- Ensure Cloud SQL connector is configured

### Manual Deployment

If needed, you can deploy manually using `gcloud`:

```bash
gcloud run deploy hrx-training \
  --image gcr.io/PROJECT_ID/hrx-training:latest \
  --region me-central1 \
  --platform managed
```

### Contact

For issues with:
- **Workflow configuration**: Check this README and workflow file
- **GCP permissions**: Contact nelc organization administrator
- **Secrets setup**: Contact nelc organization administrator
- **Application errors**: Check Cloud Run logs

