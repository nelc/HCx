# 🚀 NELC Organization Deployment

## Overview

Your HRx Training Assessment System is now deployed through the **nelc organization** on GitHub, which provides automatic Cloud Run deployment with proper GCP billing and credentials.

## 📍 Repository & Deployment Info

- **GitHub Repository**: https://github.com/nelc/hrx-training
- **Live Application**: https://learnub.futurex.sa/hrx-training
- **Deployment Status**: https://github.com/nelc/hrx-training/actions

## ✅ What's Configured

### Automatic Access
The nelc organization repository automatically provides:
- ✅ **GCP Service Account Credentials** - No personal billing needed
- ✅ **Workload Identity Federation** - Secure, keyless authentication
- ✅ **Cloud Run Deployment Permissions** - Full deployment access
- ✅ **Organization Secrets** - Pre-configured environment variables
- ✅ **Cloud SQL Access** - Database connection via organization's project

### GitHub Actions Workflow
When you push to `main` branch, the following happens automatically:
1. **Build** - Docker image is built with frontend and backend
2. **Push** - Image pushed to Google Container Registry
3. **Deploy** - Deployed to Cloud Run with Cloud SQL connection
4. **Configure** - Secrets and environment variables injected
5. **Live** - App accessible at https://learnub.futurex.sa/hrx-training

## 🔧 How It Works (App-Factory Pattern)

### Your Project Structure
```
/Users/hbinasfour/Desktop/HR/
├── backend/
│   └── src/db/index.js    ← Configured for Cloud SQL
├── frontend/
├── Dockerfile              ← Multi-stage build
├── cloudbuild.yaml         ← Cloud Build config
└── .git/                   ← Connected to nelc/hrx-training
```

### Database Connection
The `backend/src/db/index.js` automatically detects the environment:

**On Cloud Run (nelc deployment)**:
```javascript
// Uses Unix socket connection to Cloud SQL
host: `/cloudsql/${INSTANCE_CONNECTION_NAME}`
// Credentials from nelc org secrets
```

**Local Development**:
```javascript
// Uses connection string
connectionString: process.env.DATABASE_URL
```

## 📦 Organization Secrets

The nelc organization has these secrets pre-configured:
- `DB_USER` - Database username
- `DB_PASS` - Database password  
- `DB_NAME` - Database name
- `INSTANCE_CONNECTION_NAME` - Cloud SQL instance connection
- `JWT_SECRET` - JWT signing key
- `OPENAI_API_KEY` - OpenAI API access

**You don't need to create these yourself!** The organization manages them.

## 🔄 Development Workflow

### 1. Local Development
```bash
cd /Users/hbinasfour/Desktop/HR

# Create .env file for local database
cat > backend/.env << EOF
DATABASE_URL=postgresql://postgres:password@localhost:5432/hrx
JWT_SECRET=your-local-secret
OPENAI_API_KEY=your-openai-key
EOF

# Install dependencies
npm run install:all

# Run locally
npm run dev
```

### 2. Deploy Changes
```bash
# Make your changes
git add .
git commit -m "Your change description"
git push origin main
```

### 3. Monitor Deployment
- Watch GitHub Actions: https://github.com/nelc/hrx-training/actions
- Check logs when deployed:
```bash
# View app logs (requires gcloud setup with nelc project)
gcloud run logs read hrx-training --region=me-central1
```

## 🌐 Accessing Your Deployed App

### Public Endpoints
```
https://learnub.futurex.sa/hrx-training/api/health
https://learnub.futurex.sa/hrx-training/api/auth/login
https://learnub.futurex.sa/hrx-training/
```

### Testing the Deployment
```bash
# Health check
curl https://learnub.futurex.sa/hrx-training/api/health

# Expected response:
# {"status":"ok","timestamp":"2025-12-03T..."}
```

## 🔐 Security Notes

### What's Secure
- ✅ All secrets managed by nelc organization
- ✅ No credentials in your code
- ✅ Workload Identity (keyless authentication)
- ✅ Cloud SQL connection via private Unix socket
- ✅ HTTPS by default on Cloud Run

### Local Development
- Create a separate `.env` file for local work
- Never commit `.env` files (already in `.gitignore`)
- Use test/development credentials locally

## 📊 Monitoring & Logs

### GitHub Actions
View build and deployment logs:
```
https://github.com/nelc/hrx-training/actions
```

### Cloud Run Logs
If you have access to nelc's GCP project:
```bash
# Real-time logs
gcloud run logs tail hrx-training --region=me-central1

# Recent logs
gcloud run logs read hrx-training --region=me-central1 --limit=100
```

### Application Health
Monitor via health endpoint:
```bash
watch -n 5 curl -s https://learnub.futurex.sa/hrx-training/api/health
```

## 🐛 Troubleshooting

### Deployment Failed
1. Check GitHub Actions: https://github.com/nelc/hrx-training/actions
2. Review the workflow logs for errors
3. Common issues:
   - Dockerfile build errors
   - Missing dependencies
   - TypeScript/ESLint errors

### Database Connection Issues
The nelc organization manages Cloud SQL. If you see database errors:
1. Check the deployment logs
2. Verify the organization's Cloud SQL instance is running
3. Contact the nelc organization admin

### App Not Responding
```bash
# Check if app is deployed
curl https://learnub.futurex.sa/hrx-training/api/health

# If 404, deployment may still be in progress
# Check GitHub Actions for status
```

## 🔄 Updating Your App

### Quick Update
```bash
cd /Users/hbinasfour/Desktop/HR
# Make changes...
git add .
git commit -m "Update: description of changes"
git push origin main
```

### View Current Deployment
```bash
# See what's deployed
git log origin/main -1
```

## 📚 Documentation Reference

Your local documentation:
- **[README.md](./README.md)** - Project overview
- **[CLOUD_SQL_SETUP.md](./CLOUD_SQL_SETUP.md)** - Database configuration details
- **[APP_FACTORY_INTEGRATION.md](./APP_FACTORY_INTEGRATION.md)** - App-factory pattern
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Deployment guide
- **[CHANGES_SUMMARY.md](./CHANGES_SUMMARY.md)** - What was changed
- **[NELC_DEPLOYMENT.md](./NELC_DEPLOYMENT.md)** - This file

## 🎯 Key Advantages

### No Billing Worries
- ✅ No need to manage personal GCP billing
- ✅ Organization handles all cloud costs
- ✅ No credit card required

### Automatic Everything
- ✅ Push code → Automatic deployment
- ✅ No manual Cloud Build commands
- ✅ No manual Secret Manager setup
- ✅ No manual Cloud SQL configuration

### Professional Setup
- ✅ Production-ready infrastructure
- ✅ Proper CI/CD pipeline
- ✅ Secure credential management
- ✅ Custom domain (learnub.futurex.sa)

## 🚀 Next Steps

1. **Monitor first deployment**:
   - Visit: https://github.com/nelc/hrx-training/actions
   - Wait for green checkmark ✅

2. **Test your app**:
   - Visit: https://learnub.futurex.sa/hrx-training
   - Test login and features

3. **Initialize database**:
   - Contact nelc org admin to run migrations
   - Or set up database initialization in GitHub Actions

4. **Continue development**:
   - Work locally with your PostgreSQL
   - Push changes to deploy automatically

---

## 📞 Support

For issues with:
- **Code/Application**: Check your code and logs
- **Deployment/Infrastructure**: Contact nelc organization admin
- **GitHub Actions**: Review workflow logs
- **Database**: Contact nelc organization admin for Cloud SQL access

**Happy Deploying! 🎉**

