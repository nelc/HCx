import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ChartBarIcon,
  AcademicCapIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import useAuthStore from '../store/authStore';
import api from '../utils/api';
import { formatDate, getSkillLevelColor, getStatusColor, getStatusLabel, formatPercentage, getTimeRemaining } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement);

// Stat Card Component
function StatCard({ title, value, icon: Icon, color, trend, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="card p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <p className="text-3xl font-bold text-primary-700">{value}</p>
          {trend && (
            <p className={`text-xs mt-2 flex items-center gap-1 ${trend > 0 ? 'text-success-600' : 'text-danger-500'}`}>
              <ArrowTrendingUpIcon className={`w-4 h-4 ${trend < 0 ? 'rotate-180' : ''}`} />
              {Math.abs(trend)}% من الشهر الماضي
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
}

// Employee Dashboard
function EmployeeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/dashboard/employee');
        setData(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const stats = data?.stats || {};
  const pendingAssignments = data?.pending_assignments || [];
  const skillProfile = data?.skill_profile || [];
  const recentResults = data?.recent_results || [];

  const skillChartData = {
    labels: skillProfile.slice(0, 6).map(s => s.skill_name_ar),
    datasets: [{
      data: skillProfile.slice(0, 6).map(s => s.last_assessment_score || 0),
      backgroundColor: [
        'rgba(14, 57, 94, 0.8)',
        'rgba(69, 119, 175, 0.8)',
        'rgba(99, 148, 197, 0.8)',
        'rgba(147, 183, 217, 0.8)',
        'rgba(189, 211, 233, 0.8)',
        'rgba(240, 245, 250, 0.8)',
      ],
      borderWidth: 0,
    }],
  };

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-700 mb-2">مرحباً بك في نظام HRx</h1>
        <p className="text-slate-500">تتبع تقييماتك وتطور مهاراتك</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="التقييمات المعلقة"
          value={stats.pending_count || 0}
          icon={ClockIcon}
          color="bg-warning-50 text-warning-600"
          delay={0}
        />
        <StatCard
          title="التقييمات المكتملة"
          value={stats.completed_count || 0}
          icon={CheckCircleIcon}
          color="bg-success-50 text-success-600"
          delay={0.1}
        />
        <StatCard
          title="متوسط الأداء"
          value={formatPercentage(stats.avg_score)}
          icon={ChartBarIcon}
          color="bg-primary-50 text-primary-700"
          delay={0.2}
        />
        <StatCard
          title="التوصيات التدريبية"
          value={stats.total_recommendations || 0}
          icon={AcademicCapIcon}
          color="bg-accent-50 text-accent-600"
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Assessments */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-primary-700">التقييمات المعلقة</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingAssignments.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckCircleIcon className="w-12 h-12 mx-auto mb-3 text-success-500" />
                  <p>لا توجد تقييمات معلقة</p>
                </div>
              ) : (
                pendingAssignments.map((assignment, index) => {
                  const timeRemaining = getTimeRemaining(assignment.due_date);
                  return (
                    <motion.div
                      key={assignment.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: assignment.domain_color + '20' }}
                        >
                          <ClipboardDocumentListIcon 
                            className="w-6 h-6" 
                            style={{ color: assignment.domain_color }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-slate-800 truncate">{assignment.test_title_ar}</h3>
                          <p className="text-sm text-slate-500">{assignment.domain_name_ar}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                            <span>{assignment.questions_count} سؤال</span>
                            <span>{assignment.duration_minutes} دقيقة</span>
                          </div>
                        </div>
                        <div className="text-left">
                          {timeRemaining && (
                            <p className={`text-sm font-medium ${timeRemaining.expired ? 'text-danger-500' : 'text-slate-600'}`}>
                              {timeRemaining.expired ? 'منتهي' : `متبقي ${timeRemaining.text}`}
                            </p>
                          )}
                          <Link
                            to={`/assessments/${assignment.id}/take`}
                            className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                          >
                            ابدأ التقييم
                            <span className="icon-flip">←</span>
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
            {pendingAssignments.length > 0 && (
              <div className="p-4 border-t border-slate-100">
                <Link to="/assessments" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  عرض جميع التقييمات ←
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Skill Profile Chart */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-primary-700 mb-4">ملف المهارات</h2>
          {skillProfile.length > 0 ? (
            <div className="aspect-square">
              <Doughnut 
                data={skillChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      rtl: true,
                      labels: {
                        font: { family: 'IBM Plex Sans Arabic' },
                        padding: 15,
                      }
                    }
                  },
                  cutout: '60%',
                }}
              />
            </div>
          ) : (
            <div className="aspect-square flex items-center justify-center text-slate-400">
              <p className="text-center">
                لا توجد بيانات بعد<br />
                <span className="text-sm">أكمل تقييمك الأول</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Results */}
      <div className="card">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-primary-700">آخر النتائج</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {recentResults.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <ChartBarIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>لا توجد نتائج بعد</p>
            </div>
          ) : (
            recentResults.map((result, index) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: result.domain_color + '20' }}
                  >
                    <span className="text-2xl font-bold" style={{ color: result.domain_color }}>
                      {result.overall_score}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-800">{result.test_title_ar}</h3>
                    <p className="text-sm text-slate-500">{result.domain_name_ar}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(result.analyzed_at)}</p>
                  </div>
                  <Link
                    to={`/results/${result.id}`}
                    className="btn btn-secondary text-sm py-2"
                  >
                    عرض التفاصيل
                  </Link>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Admin/Training Officer Dashboard
function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/dashboard/center');
        setData(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const stats = data?.stats || {};
  const departmentParticipation = data?.department_participation || [];
  const skillGaps = data?.skill_gaps || [];
  const recentAssessments = data?.recent_assessments || [];

  const participationChartData = {
    labels: departmentParticipation.map(d => d.name_ar),
    datasets: [{
      label: 'نسبة الإكمال',
      data: departmentParticipation.map(d => d.completion_rate || 0),
      backgroundColor: 'rgba(14, 57, 94, 0.8)',
      borderRadius: 8,
    }],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-2">لوحة تحكم المركز</h1>
          <p className="text-slate-500">نظرة عامة على أداء الموظفين والتدريب</p>
        </div>
        <Link to="/tests/new" className="btn btn-primary">
          إنشاء تقييم جديد
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي الموظفين"
          value={stats.total_employees || 0}
          icon={UserGroupIcon}
          color="bg-primary-50 text-primary-700"
          delay={0}
        />
        <StatCard
          title="التقييمات النشطة"
          value={stats.active_tests || 0}
          icon={ClipboardDocumentListIcon}
          color="bg-accent-50 text-accent-600"
          delay={0.1}
        />
        <StatCard
          title="التقييمات المكتملة"
          value={stats.completed_assignments || 0}
          icon={CheckCircleIcon}
          color="bg-success-50 text-success-600"
          delay={0.2}
        />
        <StatCard
          title="التحليلات المنجزة"
          value={stats.analyzed_count || 0}
          icon={ChartBarIcon}
          color="bg-blue-50 text-blue-600"
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Participation */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-primary-700 mb-4">مشاركة الأقسام</h2>
          <div className="h-64">
            <Bar
              data={participationChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                  legend: { display: false }
                },
                scales: {
                  x: {
                    max: 100,
                    grid: { display: false },
                    ticks: { 
                      callback: (value) => value + '%',
                      font: { family: 'IBM Plex Sans Arabic' }
                    }
                  },
                  y: {
                    grid: { display: false },
                    ticks: { font: { family: 'IBM Plex Sans Arabic' } }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Top Skill Gaps */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-primary-700 mb-4">أبرز فجوات المهارات</h2>
          <div className="space-y-4">
            {skillGaps.slice(0, 5).map((skill, index) => (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: skill.domain_color }}
                ></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{skill.name_ar}</span>
                    <span className="text-sm text-slate-500">{skill.avg_score || 0}%</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-bar-fill"
                      style={{ 
                        width: `${skill.avg_score || 0}%`,
                        backgroundColor: skill.domain_color
                      }}
                    ></div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Assessments */}
      <div className="card">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary-700">آخر التقييمات المحللة</h2>
          <Link to="/tests" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            عرض الكل
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>القسم</th>
                <th>التقييم</th>
                <th>النتيجة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {recentAssessments.map((assessment) => (
                <tr key={assessment.id}>
                  <td className="font-medium">{assessment.user_name_ar}</td>
                  <td className="text-slate-500">{assessment.department_name_ar || '-'}</td>
                  <td>{assessment.test_title_ar}</td>
                  <td>
                    <span className={`badge ${assessment.overall_score >= 70 ? 'badge-success' : assessment.overall_score >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                      {assessment.overall_score}%
                    </span>
                  </td>
                  <td className="text-slate-500">{formatDate(assessment.analyzed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Dashboard Skeleton
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-6">
            <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
            <div className="h-8 bg-slate-200 rounded w-16"></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 h-80">
          <div className="h-full bg-slate-100 rounded"></div>
        </div>
        <div className="card p-6 h-80">
          <div className="h-full bg-slate-100 rounded"></div>
        </div>
      </div>
    </div>
  );
}

// Main Dashboard Component
export default function Dashboard() {
  const { user } = useAuthStore();
  
  if (user?.role === 'employee') {
    return <EmployeeDashboard />;
  }
  
  return <AdminDashboard />;
}

