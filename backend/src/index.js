const path = require('path');
// Load .env from backend folder first, then from root folder
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');

// Import admin initialization
const { initializeAdmin } = require('./db/initAdmin');

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const departmentsRoutes = require('./routes/departments');
const domainsRoutes = require('./routes/domains');
const skillsRoutes = require('./routes/skills');
const testsRoutes = require('./routes/tests');
const questionsRoutes = require('./routes/questions');
const assignmentsRoutes = require('./routes/assignments');
const responsesRoutes = require('./routes/responses');
const analysisRoutes = require('./routes/analysis');
const recommendationsRoutes = require('./routes/recommendations');
const dashboardRoutes = require('./routes/dashboard');
const notificationsRoutes = require('./routes/notifications');
const cvImportRoutes = require('./routes/cvImport');
const resultsOverviewRoutes = require('./routes/results-overview');
const coursesRoutes = require('./routes/courses');
const invitationsRoutes = require('./routes/invitations');
const trainingPlansRoutes = require('./routes/trainingPlans');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (certificates, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/responses', responsesRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/cv-import', cvImportRoutes);
app.use('/api/results-overview', resultsOverviewRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/training-plans', trainingPlansRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, async () => {
  console.log(`
  🚀 HCx Server running on port ${PORT}
  
  📍 API Endpoints:
     - Auth:           /api/auth
     - Users:          /api/users
     - Departments:    /api/departments
     - Domains:        /api/domains
     - Skills:         /api/skills
     - Tests:          /api/tests
     - Questions:      /api/questions
     - Assignments:    /api/assignments
     - Responses:      /api/responses
     - Analysis:       /api/analysis
     - Recommendations:/api/recommendations
     - Dashboard:      /api/dashboard
     - Notifications:  /api/notifications
     - CV Import:      /api/cv-import
     - Results Overview:/api/results-overview
     - Courses:        /api/courses
     - Invitations:    /api/invitations
     - Training Plans: /api/training-plans
     - Health:         /api/health
  `);
  
  // Initialize default admin user on startup
  await initializeAdmin();
});
