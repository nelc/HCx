# ⚠️ Setup Required - Action Items

## 🔴 IMPORTANT: Contact NELC Organization Administrator

Your GitHub Actions workflow is now configured, but **requires the NELC organization administrator to set up the following secrets** before deployment can succeed.

---

## 📋 Required Secrets Configuration

### Step 1: GitHub Repository Secrets

The nelc organization administrator needs to add these secrets to:
- **Repository**: `nelc/hrx-training` 
- **Or**: nelc organization level (applies to all repos)

Go to: https://github.com/nelc/hrx-training/settings/secrets/actions

#### Required GitHub Secrets:

1. **`GCP_PROJECT_ID`**
   - The GCP project ID used by nelc organization
   - Example: `nelc-production-123456`

2. **`WIF_PROVIDER`**
   - Workload Identity Federation provider path
   - Format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`
   - This enables keyless authentication from GitHub Actions to GCP

3. **`WIF_SERVICE_ACCOUNT`**
   - Service account email for GitHub Actions
   - Format: `github-actions@PROJECT_ID.iam.gserviceaccount.com`
   - Requires roles: Cloud Run Admin, Secret Manager Accessor, Storage Admin

4. **`INSTANCE_CONNECTION_NAME`**
   - Cloud SQL instance connection string
   - Format: `PROJECT_ID:REGION:INSTANCE_NAME`
   - Example: `nelc-production:me-central1:hrx-db`

### Step 2: GCP Secret Manager Secrets

The administrator needs to create these in GCP Secret Manager:

```bash
# Database credentials
echo -n "postgres" | gcloud secrets create hrx-db-user --data-file=-
echo -n "SECURE_PASSWORD" | gcloud secrets create hrx-db-pass --data-file=-
echo -n "hrx" | gcloud secrets create hrx-db-name --data-file=-

# Application secrets
echo -n "YOUR_JWT_SECRET" | gcloud secrets create hrx-jwt-secret --data-file=-
echo -n "YOUR_OPENAI_KEY" | gcloud secrets create hrx-openai-key --data-file=-
```

### Step 3: GCP Resources

Ensure these resources exist:

1. **Cloud SQL Instance**
   ```bash
   gcloud sql instances create hrx-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=me-central1
   
   gcloud sql databases create hrx --instance=hrx-db
   ```

2. **Service Account with Permissions**
   ```bash
   # Create service account (if not exists)
   gcloud iam service-accounts create github-actions \
     --display-name="GitHub Actions Deployment"
   
   # Grant necessary roles
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/run.admin"
   
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudsql.client"
   
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

3. **Workload Identity Federation**
   ```bash
   # Create Workload Identity Pool
   gcloud iam workload-identity-pools create github-pool \
     --location="global" \
     --display-name="GitHub Actions Pool"
   
   # Create Provider
   gcloud iam workload-identity-pools providers create-oidc github-provider \
     --location="global" \
     --workload-identity-pool="github-pool" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
     --attribute-condition="assertion.repository=='nelc/hrx-training'"
   
   # Bind service account
   gcloud iam service-accounts add-iam-policy-binding \
     github-actions@PROJECT_ID.iam.gserviceaccount.com \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/nelc/hrx-training"
   ```

---

## ✅ After Setup - Verify Deployment

Once the administrator has configured everything:

1. **Check GitHub Actions**
   - Go to: https://github.com/nelc/hrx-training/actions
   - The workflow should run automatically on next push
   - Or click "Run workflow" to trigger manually

2. **Monitor Deployment**
   - Watch the workflow progress
   - Check for any errors in the logs
   - Deployment typically takes 5-10 minutes

3. **Test the Application**
   ```bash
   # Health check
   curl https://learnub.futurex.sa/hrx-training/api/health
   
   # Should return: {"status":"ok","timestamp":"..."}
   ```

4. **Access the App**
   - Production URL: https://learnub.futurex.sa/hrx-training
   - Cloud Run URL: Will be shown in deployment logs

---

## 🔍 Troubleshooting

### Workflow Fails with Authentication Error
❌ **Error**: `Workload Identity Federation not configured`
✅ **Solution**: Admin needs to set up WIF_PROVIDER and WIF_SERVICE_ACCOUNT secrets

### Workflow Fails with Permission Error
❌ **Error**: `Permission denied on project`
✅ **Solution**: Admin needs to grant roles to service account (see Step 3 above)

### Deployment Succeeds but App Crashes
❌ **Error**: `Database connection failed`
✅ **Solution**: Check Cloud SQL instance exists and secrets are correct

### Cannot Access Application
❌ **Error**: `404 Not Found`
✅ **Solution**: Check Cloud Run service was deployed, verify domain routing

---

## 📞 Who to Contact

**For nelc organization setup**:
- Contact the nelc organization administrator
- They have access to the GCP project and GitHub organization settings
- Provide them with this document as a reference

**For application code issues**:
- Check GitHub repository: https://github.com/nelc/hrx-training
- Review Cloud Run logs (after deployment)
- Check local development setup

---

## 📚 Documentation Reference

- **GitHub Actions Workflow**: `.github/workflows/deploy.yml`
- **Workflow README**: `.github/workflows/README.md`
- **NELC Deployment Guide**: `NELC_DEPLOYMENT.md`
- **Cloud SQL Setup**: `CLOUD_SQL_SETUP.md`
- **App-Factory Integration**: `APP_FACTORY_INTEGRATION.md`

---

## 🎯 Current Status

- ✅ GitHub repository created: `nelc/hrx-training`
- ✅ GitHub Actions workflow configured
- ✅ Application code pushed
- ⏳ **WAITING**: Organization administrator to configure secrets
- ⏳ **WAITING**: Cloud SQL instance setup
- ⏳ **WAITING**: Workload Identity Federation setup

**Once the administrator completes the setup, your app will automatically deploy on the next push!**

