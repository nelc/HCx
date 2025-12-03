# HRx - Training Needs Assessment System

نظام تقييم الاحتياجات التدريبية - نظام متكامل لتقييم مهارات الموظفين وتحديد الفجوات التدريبية باستخدام الذكاء الاصطناعي.

## Features

### 🎯 Questionnaire & Test Builder
- Create targeted questionnaires/tests per functional area
- Support multiple question types:
  - Multiple Choice (MCQ)
  - Open Text
  - Likert Scale
  - Self-Assessment Rating
- Map each question to specific skills/competencies

### 🤖 AI-Based Response Analysis
- Process responses through AI engine (OpenAI GPT-4)
- Derive skill levels per competency (Low / Medium / High)
- Detect performance and skill gaps
- Analyze open-text answers for themes and sentiments

### 📊 Skill Gap & Recommendation Engine
- Generate analytical profiles per employee
- Identify strengths and skill gaps
- Personalized training recommendations
- Integration-ready for National Digital Content Repository API

### 📈 Multi-Level Dashboards
- Employee-level dashboard
- Department-level analytics
- Center-wide overview
- Participation rates and skill gap metrics

### 👥 User Roles
- **System Administrator (HR)**: Manage users, permissions, and training domains
- **Training & Development Officer (HR)**: Create tests, assign employees, monitor results
- **Employee**: Complete assessments and view personal development plans

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: PostgreSQL (Cloud SQL for production)
- **AI**: OpenAI GPT-4o-mini
- **Deployment**: Google Cloud Run (with app-factory pattern)
- **Database Connection**: Unix socket (Cloud Run) / Connection string (local)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- OpenAI API Key (optional, for AI analysis)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd HR
```

2. Install dependencies:
```bash
npm run install:all
```

3. Configure environment variables:
```bash
# Backend (.env in backend folder)
DATABASE_URL=postgresql://user:password@localhost:5432/hrx_db
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-your-openai-key
PORT=3001
FRONTEND_URL=http://localhost:5173
```

4. Set up the database:
```bash
# Create database
createdb hrx_db

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed
```

5. Start the development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Demo Credentials

After running the seed script:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hrx.com | password123 |
| Training Officer | training@hrx.com | password123 |
| Employee | ahmed@hrx.com | password123 |
| Employee | sara@hrx.com | password123 |

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Users
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Training Domains
- `GET /api/domains` - List domains
- `POST /api/domains` - Create domain
- `PUT /api/domains/:id` - Update domain
- `DELETE /api/domains/:id` - Delete domain

### Tests
- `GET /api/tests` - List tests
- `POST /api/tests` - Create test
- `GET /api/tests/:id` - Get test with questions
- `PUT /api/tests/:id` - Update test
- `POST /api/tests/:id/publish` - Publish test
- `DELETE /api/tests/:id` - Delete test

### Assignments
- `GET /api/assignments` - List assignments
- `GET /api/assignments/my` - Get my assignments
- `POST /api/assignments` - Assign test to users
- `POST /api/assignments/:id/start` - Start test

### Responses
- `POST /api/responses` - Save response
- `POST /api/responses/submit/:assignmentId` - Submit test

### Analysis
- `POST /api/analysis/assignment/:assignmentId` - Analyze responses
- `GET /api/analysis/:id` - Get analysis result

### Dashboard
- `GET /api/dashboard/center` - Center-wide dashboard
- `GET /api/dashboard/department/:id` - Department dashboard
- `GET /api/dashboard/employee` - Employee dashboard

## Deployment

### Google Cloud Run with Cloud SQL

This application is configured to work with Google Cloud SQL (PostgreSQL) following the **app-factory pattern** for Cloud Run deployments.

**📖 See [CLOUD_SQL_SETUP.md](./CLOUD_SQL_SETUP.md) for detailed Cloud SQL configuration instructions.**

Quick setup:

1. Set up Google Cloud project and enable required APIs
2. Create Cloud SQL PostgreSQL instance:
```bash
gcloud sql instances create hrx-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=me-central1
```

3. Configure secrets in Secret Manager:
```bash
echo -n "postgres" | gcloud secrets create hrx-db-user --data-file=-
echo -n "your-password" | gcloud secrets create hrx-db-pass --data-file=-
echo -n "hrx" | gcloud secrets create hrx-db-name --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create hrx-jwt-secret --data-file=-
echo -n "your-openai-key" | gcloud secrets create hrx-openai-key --data-file=-
```

4. Update `cloudbuild.yaml` with your Cloud SQL instance connection name

5. Deploy using Cloud Build:
```bash
gcloud builds submit --config cloudbuild.yaml
```

### Docker

```bash
# Build
docker build -t hrx-training .

# Run
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  hrx-training
```

## Project Structure

```
HR/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   ├── migrate.js
│   │   │   ├── seed.js
│   │   │   └── index.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── domains.js
│   │   │   ├── skills.js
│   │   │   ├── tests.js
│   │   │   ├── questions.js
│   │   │   ├── assignments.js
│   │   │   ├── responses.js
│   │   │   ├── analysis.js
│   │   │   ├── recommendations.js
│   │   │   ├── dashboard.js
│   │   │   └── notifications.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── layout/
│   │   ├── pages/
│   │   ├── store/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   └── package.json
├── Dockerfile
├── cloudbuild.yaml
└── package.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is proprietary software. All rights reserved.

