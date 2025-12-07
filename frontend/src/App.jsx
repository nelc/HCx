import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from './store/authStore';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tests from './pages/Tests';
import TestBuilder from './pages/TestBuilder';
import TestDetail from './pages/TestDetail';
import TakeTest from './pages/TakeTest';
import TestResultsImmediate from './pages/TestResultsImmediate';
import MyAssessments from './pages/MyAssessments';
import ResultDetail from './pages/ResultDetail';
import CompetencyMatrix from './pages/CompetencyMatrix';
import Domains from './pages/Domains';
import Users from './pages/Users';
import Departments from './pages/Departments';
import Recommendations from './pages/Recommendations';
import Settings from './pages/Settings';
import ResultsOverview from './pages/ResultsOverview';
import Courses from './pages/Courses';

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

// Page transition wrapper
function PageWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      setIsLoading(false);
    };
    init();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/80 font-medium">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'IBM Plex Sans Arabic',
            direction: 'rtl',
          },
          success: {
            style: {
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
            },
            iconTheme: {
              primary: '#22c55e',
              secondary: '#fff',
            },
          },
          error: {
            style: {
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
            },
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          } />
          
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<PageWrapper><Dashboard /></PageWrapper>} />
            
            {/* Employee routes */}
            <Route path="assessments" element={<PageWrapper><MyAssessments /></PageWrapper>} />
            <Route path="assessments/:id/take" element={<PageWrapper><TakeTest /></PageWrapper>} />
            <Route path="test-results/:assignmentId" element={<PageWrapper><TestResultsImmediate /></PageWrapper>} />
            <Route path="results/:id" element={<PageWrapper><ResultDetail /></PageWrapper>} />
            <Route path="competency-matrix" element={<PageWrapper><CompetencyMatrix /></PageWrapper>} />
            <Route path="recommendations" element={<PageWrapper><Recommendations /></PageWrapper>} />
            
            {/* Training officer routes */}
            <Route path="tests" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><Tests /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="tests/new" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><TestBuilder /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="tests/:id" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><TestDetail /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="tests/:id/edit" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><TestBuilder /></PageWrapper>
              </ProtectedRoute>
            } />
            
            {/* Admin routes */}
            <Route path="domains" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><Domains /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><Users /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="departments" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PageWrapper><Departments /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="courses" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><Courses /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="results-overview" element={
              <ProtectedRoute allowedRoles={['admin', 'training_officer']}>
                <PageWrapper><ResultsOverview /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="settings" element={<PageWrapper><Settings /></PageWrapper>} />
          </Route>
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

export default App;

