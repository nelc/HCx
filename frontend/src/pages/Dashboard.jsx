import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ChartBarIcon,
  AcademicCapIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  TagIcon,
  FolderIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  LightBulbIcon,
  PresentationChartBarIcon,
  Squares2X2Icon,
  FireIcon,
  StarIcon,
  BoltIcon,
  DocumentArrowUpIcon,
  BookOpenIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { TrophyIcon as TrophySolidIcon } from '@heroicons/react/24/solid';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, RadialLinearScale } from 'chart.js';
import { Doughnut, Bar, Line, Radar } from 'react-chartjs-2';
import useAuthStore from '../store/authStore';
import api from '../utils/api';
import { formatDate, getSkillLevelColor, getStatusColor, getStatusLabel, formatPercentage, getTimeRemaining } from '../utils/helpers';
import Leaderboard from '../components/Leaderboard';
import AchievementBadges, { PercentileBadge } from '../components/AchievementBadges';
import PeerRankings from '../components/PeerRankings';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, RadialLinearScale);

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

// My Department Info Component for Employees
function MyDepartmentInfo() {
  const [departmentInfo, setDepartmentInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDepartmentInfo = async () => {
      try {
        const response = await api.get('/departments/my-department/info');
        setDepartmentInfo(response.data);
      } catch (error) {
        console.error('Failed to fetch department info:', error);
        setDepartmentInfo(null);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartmentInfo();
  }, []);

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-48 mb-4"></div>
        <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
      </div>
    );
  }

  if (!departmentInfo) {
    return null; // Don't show if user has no department
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-l from-primary-600 to-primary-700 p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <BuildingOffice2Icon className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{departmentInfo.name_ar}</h2>
            <div className="flex items-center gap-3 text-white/80 text-sm mt-1">
              {departmentInfo.parent_name_ar && (
                <span>{departmentInfo.parent_name_ar}</span>
              )}
              {departmentInfo.grandparent_name_ar && (
                <>
                  <span>•</span>
                  <span>{departmentInfo.grandparent_name_ar}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Objective */}
        {departmentInfo.objective_ar && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-2">
              <DocumentTextIcon className="w-5 h-5 text-primary-600" />
              الهدف الرئيسي
            </div>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-4">
              {departmentInfo.objective_ar}
            </p>
          </div>
        )}

        {/* Responsibilities */}
        {departmentInfo.responsibilities && departmentInfo.responsibilities.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-2">
              <DocumentTextIcon className="w-5 h-5 text-accent-600" />
              المسؤوليات ({departmentInfo.responsibilities.length})
            </div>
            <ul className="bg-slate-50 rounded-lg p-4 space-y-2">
              {departmentInfo.responsibilities.map((resp, index) => (
                <li key={index} className="flex items-start gap-2 text-slate-700">
                  <span className="w-5 h-5 bg-accent-100 text-accent-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{resp.text_ar || resp.text_en}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Related Domains */}
        {departmentInfo.domains && departmentInfo.domains.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-3">
              <FolderIcon className="w-5 h-5 text-primary-600" />
              مجالات التدريب المرتبطة ({departmentInfo.domains.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departmentInfo.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="border border-slate-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: (domain.color || '#502390') + '20' }}
                    >
                      <FolderIcon className="w-5 h-5" style={{ color: domain.color || '#502390' }} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">{domain.name_ar}</h4>
                      <p className="text-xs text-slate-500">{domain.name_en}</p>
                    </div>
                  </div>
                  
                  {domain.skills && domain.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {domain.skills.map((skill) => (
                        <span
                          key={skill.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full"
                          style={{ 
                            backgroundColor: (domain.color || '#502390') + '15',
                            color: domain.color || '#502390'
                          }}
                        >
                          <TagIcon className="w-3 h-3" />
                          {skill.name_ar}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!departmentInfo.objective_ar && 
         (!departmentInfo.responsibilities || departmentInfo.responsibilities.length === 0) && 
         (!departmentInfo.domains || departmentInfo.domains.length === 0) && (
          <div className="text-center py-8 text-slate-400">
            <DocumentTextIcon className="w-12 h-12 mx-auto mb-3" />
            <p>لم يتم تحديد معلومات إضافية لهذه الإدارة بعد</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Performance Summary Hero Component
function PerformanceSummary({ stats, leaderboardData }) {
  const percentile = leaderboardData?.user_stats?.percentile;
  const scoreChange = leaderboardData?.user_stats?.score_change || 0;
  const streak = leaderboardData?.user_stats?.current_streak || 0;

  const getPercentileLabel = (p) => {
    if (p >= 90) return { text: 'نخبة الأفضل', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
    if (p >= 75) return { text: 'متميز', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    if (p >= 50) return { text: 'فوق المتوسط', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    return { text: 'في تطور', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
  };

  const percentileInfo = percentile ? getPercentileLabel(percentile) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-primary-600 via-primary-700 to-primary-800 p-6 text-white shadow-xl"
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Main Score */}
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30">
                <span className="text-3xl font-bold">
                  {stats?.avg_score != null ? Math.round(stats.avg_score) : '-'}%
                </span>
              </div>
              {scoreChange !== 0 && (
                <div className={`absolute -bottom-1 -right-1 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                  scoreChange > 0 ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {scoreChange > 0 ? (
                    <ArrowTrendingUpIcon className="w-3 h-3" />
                  ) : (
                    <ArrowTrendingDownIcon className="w-3 h-3" />
                  )}
                  {Math.abs(scoreChange)}%
                </div>
              )}
            </div>
            
            <div>
              <h2 className="text-xl font-bold mb-1">متوسط أدائك</h2>
              <p className="text-white/70 text-sm">بناءً على {stats?.completed_count || 0} تقييم مكتمل</p>
              
              {percentileInfo && (
                <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full ${percentileInfo.bg} ${percentileInfo.border} border`}>
                  <TrophySolidIcon className={`w-4 h-4 ${percentileInfo.color}`} />
                  <span className={`text-sm font-semibold ${percentileInfo.color}`}>
                    أفضل {100 - percentile + 1}% - {percentileInfo.text}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 mb-1">
                <ClockIcon className="w-5 h-5 text-yellow-300" />
                <span className="text-2xl font-bold">{stats?.pending_count || 0}</span>
              </div>
              <p className="text-white/70 text-xs">تقييم معلق</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircleIcon className="w-5 h-5 text-green-300" />
                <span className="text-2xl font-bold">{stats?.completed_count || 0}</span>
              </div>
              <p className="text-white/70 text-xs">تقييم مكتمل</p>
            </div>
            
            {streak > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-4 min-w-[120px]">
                <div className="flex items-center gap-2 mb-1">
                  <FireIcon className="w-5 h-5 text-orange-300" />
                  <span className="text-2xl font-bold">{streak}</span>
                </div>
                <p className="text-white/70 text-xs">تقييم متتالي 🔥</p>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur rounded-xl p-4 min-w-[120px]">
              <div className="flex items-center gap-2 mb-1">
                <AcademicCapIcon className="w-5 h-5 text-purple-300" />
                <span className="text-2xl font-bold">{stats?.total_recommendations || 0}</span>
              </div>
              <p className="text-white/70 text-xs">توصية تدريبية</p>
            </div>
          </div>
        </div>

        {/* Achievement badges preview */}
        {leaderboardData?.achievements?.length > 0 && (
          <div className="mt-6 pt-4 border-t border-white/20">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-white/70">إنجازاتك:</span>
              {leaderboardData.achievements.slice(0, 4).map((achievement, idx) => (
                <motion.span
                  key={achievement.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white/20 rounded-full text-xs"
                >
                  {achievement.color === 'gold' && '🏆'}
                  {achievement.color === 'silver' && '⭐'}
                  {achievement.color === 'bronze' && '🥉'}
                  {achievement.color === 'purple' && '✨'}
                  {achievement.color === 'blue' && '📋'}
                  {achievement.color === 'red' && '🔥'}
                  {achievement.color === 'green' && '🎓'}
                  {achievement.color === 'orange' && '📈'}
                  {achievement.color === 'teal' && '📚'}
                  {achievement.title_ar}
                </motion.span>
              ))}
              {leaderboardData.achievements.length > 4 && (
                <span className="text-xs text-white/50">+{leaderboardData.achievements.length - 4}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Skills Radar Chart Component
function SkillsRadarChart({ skills }) {
  if (!skills || skills.length < 3) return null;

  // Take top 8 skills for radar chart, sorted by most recent assessment
  const topSkills = skills.slice(0, 8);
  
  const chartData = {
    labels: topSkills.map(s => s.skill_name_ar || 'مهارة'),
    datasets: [{
      label: 'مستوى المهارة',
      data: topSkills.map(s => s.last_assessment_score || 0),
      backgroundColor: 'rgba(80, 35, 144, 0.2)',
      borderColor: 'rgba(80, 35, 144, 0.8)',
      borderWidth: 2,
      pointBackgroundColor: topSkills.map(s => {
        // Color points based on trend
        if (s.trend === 'improving') return 'rgba(34, 197, 94, 1)';
        if (s.trend === 'declining') return 'rgba(239, 68, 68, 1)';
        return 'rgba(80, 35, 144, 1)';
      }),
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(80, 35, 144, 1)',
      pointRadius: 5,
    }],
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-primary-700">خريطة المهارات</h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            تحسن
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            تراجع
          </span>
        </div>
      </div>
      <div className="aspect-square max-h-[300px] mx-auto">
        <Radar
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: { 
                rtl: true,
                callbacks: {
                  label: function(context) {
                    const skill = topSkills[context.dataIndex];
                    const trend = skill?.trend === 'improving' ? '(تحسن ↑)' : 
                                  skill?.trend === 'declining' ? '(تراجع ↓)' : '';
                    return `${context.parsed.r}% ${trend}`;
                  }
                }
              }
            },
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  stepSize: 20,
                  font: { size: 10 }
                },
                pointLabels: {
                  font: { family: 'IBM Plex Sans Arabic', size: 10 },
                }
              }
            }
          }}
        />
      </div>
    </div>
  );
}

// Helper function to extract first name from Arabic full name
// Handles compound names like عبدالله، عبدالرحمن، عبد الله (when split)
const getArabicFirstName = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  
  // Check if first part is "عبد" alone (compound name written as two words)
  if (parts[0] === 'عبد' && parts.length > 1) {
    return `${parts[0]} ${parts[1]}`;
  }
  
  return parts[0];
};

// CV Skills Section Component
function CVSkillsSection({ cvSkills = [] }) {
  if (!cvSkills || cvSkills.length === 0) {
    return null;
  }

  // Group skills by domain
  const skillsByDomain = cvSkills.reduce((acc, skill) => {
    const domainId = skill.domain_id;
    if (!acc[domainId]) {
      acc[domainId] = {
        domain_id: domainId,
        domain_name_ar: skill.domain_name_ar,
        domain_name_en: skill.domain_name_en,
        domain_color: skill.domain_color || '#502390',
        skills: []
      };
    }
    acc[domainId].skills.push(skill);
    return acc;
  }, {});

  const domains = Object.values(skillsByDomain);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-600 to-teal-700 p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <DocumentArrowUpIcon className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">مهاراتك من السيرة الذاتية</h2>
            <p className="text-white/80 text-sm mt-1">
              {cvSkills.length} مهارة مستخرجة من سيرتك الذاتية
            </p>
          </div>
        </div>
      </div>

      {/* Skills by Domain */}
      <div className="p-6 space-y-6">
        {domains.map((domain) => (
          <div key={domain.domain_id}>
            <div className="flex items-center gap-2 mb-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: domain.domain_color }}
              />
              <h3 className="font-semibold text-slate-700">{domain.domain_name_ar}</h3>
              <span className="text-xs text-slate-400">({domain.skills.length} مهارة)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {domain.skills.map((skill) => (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group relative"
                >
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all hover:shadow-md cursor-default"
                    style={{ 
                      backgroundColor: domain.domain_color + '15',
                      color: domain.domain_color,
                      borderLeft: `3px solid ${domain.domain_color}`
                    }}
                  >
                    <TagIcon className="w-4 h-4" />
                    {skill.skill_name_ar}
                    {skill.confidence_score >= 1.0 ? (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-500" title="مؤكدة" />
                    ) : (
                      <span className="text-xs text-slate-400" title="محتملة">~</span>
                    )}
                  </span>
                  {/* Tooltip */}
                  {skill.skill_description_ar && (
                    <div className="absolute bottom-full right-0 mb-2 p-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-48 text-right">
                      {skill.skill_description_ar}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="pt-4 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
            <span>مهارة مؤكدة</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">~</span>
            <span>مهارة محتملة</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Employee Dashboard
function EmployeeDashboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Function to fetch fresh dashboard data
  const fetchDashboardData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setRefreshing(true);
    }
    try {
      // Add timestamp to prevent caching and ensure fresh data
      const timestamp = Date.now();
      const [dashboardRes, leaderboardRes] = await Promise.all([
        api.get(`/dashboard/employee?_t=${timestamp}`),
        api.get(`/dashboard/employee/leaderboard?_t=${timestamp}`).catch(() => ({ data: null }))
      ]);
      setData(dashboardRes.data);
      setLeaderboardData(leaderboardRes.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Refresh data when window regains focus (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && data) {
        // Refresh data when user returns to tab (after 30 seconds)
        const now = Date.now();
        const lastUpdate = lastUpdated ? lastUpdated.getTime() : 0;
        if (now - lastUpdate > 30000) {
          fetchDashboardData(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [data, lastUpdated]);

  // Manual refresh handler
  const handleRefresh = () => {
    fetchDashboardData(true);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="card p-12 text-center">
        <ExclamationCircleIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">فشل تحميل البيانات</h3>
        <p className="text-slate-500 mb-4">حدث خطأ أثناء تحميل بيانات لوحة التحكم</p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const stats = data?.stats || {};
  const pendingAssignments = (data?.pending_assignments || []).map(a => ({
    ...a,
    test_title_ar: a.test_title_ar || a.test_title_en || 'تقييم',
    domain_name_ar: a.domain_name_ar || a.domain_name_en || 'مجال',
    domain_color: a.domain_color || '#502390',
    questions_count: a.questions_count || 0,
    duration_minutes: a.duration_minutes || 0,
  }));
  const skillProfile = data?.skill_profile || [];
  const departmentSkills = data?.department_skills || [];
  const cvSkills = data?.cv_skills || [];
  const recentResults = (data?.recent_results || []).map(r => ({
    ...r,
    test_title_ar: r.test_title_ar || r.test_title_en || 'تقييم',
    domain_name_ar: r.domain_name_ar || r.domain_name_en || 'مجال',
    domain_color: r.domain_color || '#502390',
    overall_score: r.overall_score || 0,
    analyzed_at: r.analyzed_at || r.created_at,
  }));

  // Filter and sort skills: remove null/zero scores, include trend info
  const validSkills = skillProfile
    .filter(s => s && s.last_assessment_score != null && s.last_assessment_score > 0)
    .map(s => ({
      ...s,
      skill_name_ar: s.skill_name_ar || s.skill_name_en || 'مهارة',
      domain_color: s.domain_color || '#502390',
      // Include trend data for visual indicators
      trend: s.improvement_trend || 'stable',
      lastAssessed: s.last_assessment_date ? new Date(s.last_assessment_date) : null,
    }))
    .sort((a, b) => {
      // Sort by most recently assessed first, then by score
      const dateA = a.lastAssessed ? a.lastAssessed.getTime() : 0;
      const dateB = b.lastAssessed ? b.lastAssessed.getTime() : 0;
      if (Math.abs(dateA - dateB) < 86400000) { // Within same day
        return (b.last_assessment_score || 0) - (a.last_assessment_score || 0);
      }
      return dateB - dateA;
    });

  const skillChartData = {
    labels: validSkills.slice(0, 6).map(s => s.skill_name_ar || 'مهارة'),
    datasets: [{
      data: validSkills.slice(0, 6).map(s => s.last_assessment_score || 0),
      backgroundColor: [
        'rgba(80, 35, 144, 0.8)',
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
      {/* Welcome message with refresh button */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-1">مرحبا بك {getArabicFirstName(user?.name_ar)}</h1>
          <p className="text-slate-500">تتبع مهاراتك الوظيفية لتكون قادرا على أداء مهامك بجدارة</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="تحديث البيانات"
          >
            <svg 
              className={`w-4 h-4 text-primary-600 ${refreshing ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'جاري التحديث...' : 'تحديث'}
          </button>
        </div>
      </div>

      {/* Performance Summary Hero */}
      <PerformanceSummary stats={stats} leaderboardData={leaderboardData} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Pending Assessments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Assessments */}
          <div className="card">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary-700">التقييمات المعلقة</h2>
              {pendingAssignments.length > 0 && (
                <span className="px-3 py-1 bg-warning-100 text-warning-700 rounded-full text-sm font-medium">
                  {pendingAssignments.length} معلق
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {pendingAssignments.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckCircleIcon className="w-12 h-12 mx-auto mb-3 text-success-500" />
                  <p className="font-medium">لا توجد تقييمات معلقة</p>
                  <p className="text-sm text-slate-400 mt-1">أحسنت! أكملت جميع التقييمات</p>
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
                          <h3 className="font-medium text-slate-800 truncate">{assignment.test_title_ar || 'تقييم'}</h3>
                          <p className="text-sm text-slate-500">{assignment.domain_name_ar || 'مجال'}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                            <span>{assignment.questions_count || 0} سؤال</span>
                            <span>{assignment.duration_minutes || 0} دقيقة</span>
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
                  <p className="text-sm text-slate-400 mt-1">أكمل تقييماتك لعرض النتائج</p>
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
                        className="w-16 h-16 rounded-xl flex flex-col items-center justify-center shrink-0"
                        style={{ backgroundColor: (result.domain_color || '#502390') + '20' }}
                      >
                        <span className="text-lg font-bold" style={{ color: result.domain_color || '#502390' }}>
                          {result.overall_score || 0}%
                        </span>
                        {result.needs_grading && (
                          <span className="text-xs text-amber-600">(غير نهائية)</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-slate-800">{result.test_title_ar || 'تقييم'}</h3>
                          {result.needs_grading && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                              <ExclamationTriangleIcon className="w-3 h-3" />
                              يحتاج تقييم ({result.ungraded_count})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{result.domain_name_ar || 'مجال'}</p>
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

        {/* Right Column - Skills & Charts */}
        <div className="space-y-6">
          {/* Skill Profile Chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-primary-700">ملف المهارات</h2>
              {validSkills.length > 0 && (
                <span className="text-xs text-slate-500">
                  {validSkills.length} مهارة مقيّمة
                </span>
              )}
            </div>
            {validSkills.length > 0 ? (
              <div className="min-h-[280px]">
                <Bar 
                  data={{
                    labels: validSkills.slice(0, 6).map(s => {
                      // Add trend indicator to label
                      const trendIcon = s.trend === 'improving' ? ' ↑' : s.trend === 'declining' ? ' ↓' : '';
                      return (s.skill_name_ar || 'مهارة') + trendIcon;
                    }),
                    datasets: [{
                      label: 'مستوى المهارة',
                      data: validSkills.slice(0, 6).map(s => s.last_assessment_score || 0),
                      backgroundColor: validSkills.slice(0, 6).map(s => {
                        const score = s.last_assessment_score || 0;
                        if (score >= 80) return 'rgba(34, 197, 94, 0.85)';
                        if (score >= 60) return 'rgba(80, 35, 144, 0.85)';
                        if (score >= 40) return 'rgba(237, 122, 30, 0.85)';
                        return 'rgba(239, 68, 68, 0.85)';
                      }),
                      borderRadius: 6,
                      borderSkipped: false,
                    }],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false,
                      },
                      tooltip: {
                        rtl: true,
                        callbacks: {
                          label: function(context) {
                            const skill = validSkills[context.dataIndex];
                            const trend = skill?.trend === 'improving' ? '(تحسن)' : 
                                          skill?.trend === 'declining' ? '(تراجع)' : '';
                            return `${context.parsed.x}% ${trend}`;
                          },
                          afterLabel: function(context) {
                            const skill = validSkills[context.dataIndex];
                            if (skill?.lastAssessed) {
                              return `آخر تقييم: ${skill.lastAssessed.toLocaleDateString('ar-SA')}`;
                            }
                            return '';
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        min: 0,
                        max: 100,
                        grid: {
                          color: 'rgba(0, 0, 0, 0.05)',
                        },
                        ticks: {
                          font: { family: 'IBM Plex Sans Arabic', size: 11 },
                          callback: function(value) {
                            return value + '%';
                          }
                        }
                      },
                      y: {
                        grid: {
                          display: false,
                        },
                        ticks: {
                          font: { family: 'IBM Plex Sans Arabic', size: 12 },
                          color: '#334155',
                        }
                      }
                    },
                  }}
                />
              </div>
            ) : (
              <div className="min-h-[280px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <ChartBarIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>لا توجد بيانات بعد</p>
                  <p className="text-sm mt-1">أكمل تقييمك الأول لعرض مهاراتك</p>
                </div>
              </div>
            )}
          </div>

          {/* Skills Radar Chart */}
          {validSkills.length >= 3 && (
            <SkillsRadarChart skills={validSkills} />
          )}
        </div>
      </div>

      {/* Leaderboard Section */}
      <Leaderboard />

      {/* Achievements Section */}
      {leaderboardData?.achievements && leaderboardData.achievements.length > 0 && (
        <AchievementBadges 
          achievements={leaderboardData.achievements} 
          stats={leaderboardData.user_stats}
        />
      )}

      {/* CV Skills Section */}
      <CVSkillsSection cvSkills={cvSkills} />

      {/* My Department Section */}
      <MyDepartmentInfo />

    </div>
  );
}

// Score Distribution Donut Chart Component
function ScoreDistributionChart({ data }) {
  const categoryLabels = {
    excellent: 'ممتاز (90%+)',
    good: 'جيد (70-89%)',
    average: 'متوسط (50-69%)',
    needs_improvement: 'يحتاج تحسين (30-49%)',
    critical: 'حرج (أقل من 30%)',
  };

  const categoryColors = {
    excellent: '#22c55e',
    good: '#84cc16',
    average: '#f59e0b',
    needs_improvement: '#f97316',
    critical: '#ef4444',
  };

  const chartData = {
    labels: data.map(d => categoryLabels[d.category] || d.category),
    datasets: [{
      data: data.map(d => Number(d.count) || 0),
      backgroundColor: data.map(d => categoryColors[d.category] || '#502390'),
      borderWidth: 0,
    }],
  };

  return (
    <div className="h-64">
      <Doughnut
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              rtl: true,
              labels: {
                font: { family: 'IBM Plex Sans Arabic', size: 11 },
                padding: 12,
                usePointStyle: true,
              }
            },
            tooltip: { rtl: true }
          }
        }}
      />
    </div>
  );
}

// Assessment Trends Line Chart Component
function AssessmentTrendsChart({ data }) {
  const chartData = {
    labels: data.map(d => d.month),
    datasets: [
      {
        label: 'متوسط النتيجة',
        data: data.map(d => Number(d.avg_score) || 0),
        borderColor: '#502390',
        backgroundColor: 'rgba(80, 35, 144, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: 'عدد التقييمات',
        data: data.map(d => Number(d.assessments_count) || 0),
        borderColor: '#ed7a1e',
        backgroundColor: 'transparent',
        tension: 0.4,
        yAxisID: 'y1',
      }
    ],
  };

  return (
    <div className="h-64">
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              position: 'bottom',
              rtl: true,
              labels: {
                font: { family: 'IBM Plex Sans Arabic', size: 11 },
                padding: 12,
                usePointStyle: true,
              }
            },
            tooltip: { rtl: true }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { family: 'IBM Plex Sans Arabic', size: 10 } }
            },
            y: {
              type: 'linear',
              display: true,
              position: 'right',
              max: 100,
              ticks: { 
                callback: (v) => v + '%',
                font: { family: 'IBM Plex Sans Arabic' }
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'left',
              grid: { drawOnChartArea: false },
              ticks: { font: { family: 'IBM Plex Sans Arabic' } }
            },
          }
        }}
      />
    </div>
  );
}

// Department Card Component
function DepartmentCard({ department, skillsData, isExpanded, onToggle }) {
  const deptSkills = skillsData?.find(s => s.department_id === department.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      <div 
        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <BuildingOffice2Icon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">{department.name_ar}</h3>
              <p className="text-xs text-slate-500">
                {department.type === 'sector' ? 'قطاع' : department.type === 'department' ? 'إدارة' : 'قسم'}
                {department.parent_name_ar && ` • ${department.parent_name_ar}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <p className="text-2xl font-bold text-primary-700">{department.employee_count || 0}</p>
              <p className="text-xs text-slate-500">موظف</p>
            </div>
            <div className="text-left">
              <p className={`text-2xl font-bold ${
                (department.avg_score || 0) >= 70 ? 'text-success-600' : 
                (department.avg_score || 0) >= 40 ? 'text-warning-600' : 'text-danger-600'
              }`}>
                {department.avg_score || '-'}%
              </p>
              <p className="text-xs text-slate-500">متوسط</p>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-accent-600">{department.completion_rate || 0}%</p>
              <p className="text-xs text-slate-500">إكمال</p>
            </div>
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && deptSkills && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-100 overflow-hidden"
          >
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Skills */}
              <div>
                <h4 className="text-sm font-semibold text-success-700 mb-3 flex items-center gap-2">
                  <ArrowTrendingUpIcon className="w-4 h-4" />
                  أفضل المهارات
                </h4>
                {deptSkills.top_skills?.length > 0 ? (
                  <div className="space-y-2">
                    {deptSkills.top_skills.map((skill, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-success-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: skill.domain_color || '#22c55e' }}
                          />
                          <span className="text-sm text-slate-700">{skill.skill_name_ar}</span>
                        </div>
                        <span className="text-sm font-bold text-success-700">{skill.avg_score}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">لا توجد بيانات</p>
                )}
              </div>

              {/* Weak Skills */}
              <div>
                <h4 className="text-sm font-semibold text-danger-700 mb-3 flex items-center gap-2">
                  <ArrowTrendingDownIcon className="w-4 h-4" />
                  المهارات الضعيفة
                </h4>
                {deptSkills.weak_skills?.length > 0 ? (
                  <div className="space-y-2">
                    {deptSkills.weak_skills.map((skill, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-danger-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: skill.domain_color || '#ef4444' }}
                          />
                          <span className="text-sm text-slate-700">{skill.skill_name_ar}</span>
                        </div>
                        <span className="text-sm font-bold text-danger-700">{skill.avg_score}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">لا توجد بيانات</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Performer Card Component
function PerformerCard({ user, rank, isTop }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: isTop ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`flex items-center gap-3 p-3 rounded-xl ${
        isTop ? 'bg-gradient-to-l from-success-50 to-white' : 'bg-gradient-to-l from-warning-50 to-white'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
        rank === 1 ? 'bg-amber-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-700' : 'bg-slate-300'
      }`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate">{user.name_ar}</p>
        <p className="text-xs text-slate-500 truncate">{user.department_name_ar || '-'}</p>
      </div>
      <div className="text-left">
        <p className={`text-lg font-bold ${isTop ? 'text-success-600' : 'text-warning-600'}`}>
          {user.avg_score}%
        </p>
        <p className="text-xs text-slate-400">{user.assessments_count} تقييم</p>
      </div>
    </motion.div>
  );
}

// Badge Icon Component for Admin Dashboard
const badgeIconMap = {
  trophy: TrophyIcon,
  medal: StarIcon,
  star: StarIcon,
  clipboard: ClipboardDocumentListIcon,
  fire: FireIcon,
  academic: AcademicCapIcon,
  'trending-up': ArrowTrendingUpIcon,
  book: BookOpenIcon,
  spark: SparklesIcon,
};

const badgeColorMap = {
  gold: { bg: 'bg-gradient-to-br from-yellow-100 to-amber-100', border: 'border-yellow-300', icon: 'text-yellow-600', text: 'text-yellow-800' },
  silver: { bg: 'bg-gradient-to-br from-slate-100 to-gray-100', border: 'border-slate-300', icon: 'text-slate-500', text: 'text-slate-700' },
  bronze: { bg: 'bg-gradient-to-br from-amber-100 to-orange-100', border: 'border-amber-400', icon: 'text-amber-700', text: 'text-amber-900' },
  purple: { bg: 'bg-gradient-to-br from-purple-100 to-violet-100', border: 'border-purple-300', icon: 'text-purple-600', text: 'text-purple-800' },
  blue: { bg: 'bg-gradient-to-br from-blue-100 to-sky-100', border: 'border-blue-300', icon: 'text-blue-600', text: 'text-blue-800' },
  green: { bg: 'bg-gradient-to-br from-emerald-100 to-green-100', border: 'border-emerald-300', icon: 'text-emerald-600', text: 'text-emerald-800' },
  red: { bg: 'bg-gradient-to-br from-red-100 to-rose-100', border: 'border-red-300', icon: 'text-red-600', text: 'text-red-800' },
  orange: { bg: 'bg-gradient-to-br from-orange-100 to-amber-100', border: 'border-orange-300', icon: 'text-orange-600', text: 'text-orange-800' },
  teal: { bg: 'bg-gradient-to-br from-teal-100 to-cyan-100', border: 'border-teal-300', icon: 'text-teal-600', text: 'text-teal-800' },
};

// Badge Rules Card Component - Shows badge criteria for admins
function BadgeRulesCard({ badgeDefinitions, categories }) {
  const [expandedCategory, setExpandedCategory] = useState(null);

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-purple-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <InformationCircleIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-purple-700">معايير منح الأوسمة</h2>
            <p className="text-sm text-slate-500">الشروط المطلوبة للحصول على كل وسام</p>
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
              className="w-full p-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="font-medium text-slate-700">{category.title_ar}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{category.badges.length} أوسمة</span>
                {expandedCategory === category.id ? (
                  <ChevronUpIcon className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>
            
            <AnimatePresence>
              {expandedCategory === category.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 space-y-3 bg-white">
                    {category.badges.map((badge) => {
                      const IconComponent = badgeIconMap[badge.icon] || StarIcon;
                      const colors = badgeColorMap[badge.color] || badgeColorMap.blue;
                      
                      return (
                        <div key={badge.id} className={`p-3 rounded-xl border ${colors.bg} ${colors.border}`}>
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${colors.bg}`}>
                              <IconComponent className={`w-5 h-5 ${colors.icon}`} />
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-semibold ${colors.text}`}>{badge.title_ar}</h4>
                              <p className="text-sm text-slate-600 mt-1">{badge.description_ar}</p>
                              <p className="text-xs text-slate-500 mt-2 p-2 bg-white/50 rounded-lg">
                                <span className="font-medium">المعيار:</span> {badge.criteria_ar}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

// Employee Badge Card Component
function EmployeeBadgeCard({ employee, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="p-4 rounded-xl border border-slate-200 hover:border-primary-300 transition-all hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 truncate">{employee.name_ar}</h4>
          <p className="text-xs text-slate-500">{employee.department_name_ar || '-'}</p>
          <p className="text-xs text-slate-400">{employee.job_title_ar || '-'}</p>
        </div>
        <div className="text-left">
          <p className="text-lg font-bold text-primary-600">{employee.avg_score}%</p>
          <p className="text-xs text-slate-400">{employee.badge_count} أوسمة</p>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
        {employee.badges.map((badge) => {
          const IconComponent = badgeIconMap[badge.icon] || StarIcon;
          const colors = badgeColorMap[badge.color] || badgeColorMap.blue;
          
          return (
            <div
              key={badge.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${colors.bg} ${colors.border} border`}
              title={badge.title_ar}
            >
              <IconComponent className={`w-3 h-3 ${colors.icon}`} />
              <span className={colors.text}>{badge.title_ar}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// Badge Summary Card Component
function BadgeSummaryCard({ badgeId, count, badge }) {
  const IconComponent = badgeIconMap[badge?.icon] || StarIcon;
  const colors = badgeColorMap[badge?.color] || badgeColorMap.blue;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl border-2 ${colors.bg} ${colors.border}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <IconComponent className={`w-6 h-6 ${colors.icon}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold ${colors.text}`}>{count}</p>
          <p className={`text-sm ${colors.text} opacity-80`}>{badge?.title_ar || badgeId}</p>
        </div>
      </div>
    </motion.div>
  );
}

// Admin/Training Officer Dashboard - Enhanced Version
function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedDept, setExpandedDept] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [badgeDefinitions, setBadgeDefinitions] = useState(null);
  const [badgeCategories, setBadgeCategories] = useState([]);
  const [employeesWithBadges, setEmployeesWithBadges] = useState([]);
  const [badgeSummary, setBadgeSummary] = useState({});
  const [badgeStats, setBadgeStats] = useState({ total_with_badges: 0, total_employees: 0 });
  const [badgeFilterType, setBadgeFilterType] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardRes, badgeDefsRes, badgeEmpRes] = await Promise.all([
          api.get('/dashboard/center/insights'),
          api.get('/dashboard/badges/definitions').catch(() => ({ data: null })),
          api.get('/dashboard/badges/employees').catch(() => ({ data: null }))
        ]);
        
        setData(dashboardRes.data);
        
        if (badgeDefsRes.data) {
          setBadgeDefinitions(badgeDefsRes.data.badges);
          setBadgeCategories(badgeDefsRes.data.categories || []);
        }
        
        if (badgeEmpRes.data) {
          setEmployeesWithBadges(badgeEmpRes.data.employees_with_badges || []);
          setBadgeSummary(badgeEmpRes.data.badge_summary || {});
          setBadgeStats({
            total_with_badges: badgeEmpRes.data.total_employees_with_badges || 0,
            total_employees: badgeEmpRes.data.total_employees || 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="card p-12 text-center">
        <ExclamationCircleIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">فشل تحميل البيانات</h3>
        <p className="text-slate-500 mb-4">حدث خطأ أثناء تحميل بيانات لوحة التحكم</p>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const {
    organization_summary: summary = {},
    department_analytics: departments = [],
    top_performers: topPerformers = [],
    bottom_performers: bottomPerformers = [],
    skills_by_department: skillsByDept = [],
    training_needs_priority: trainingNeeds = [],
    departments_training_needs: deptsTrainingNeeds = [],
    recent_activity: recentActivity = [],
    score_distribution: scoreDistribution = [],
    assessment_trends: assessmentTrends = [],
  } = data;

  // Filter departments with employees for display
  const activeDepartments = departments.filter(d => d.employee_count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-1">لوحة رؤى الموارد البشرية</h1>
          <p className="text-slate-500">تحليلات شاملة لأداء الموظفين والاحتياجات التدريبية</p>
        </div>
        <div className="flex gap-2">
          <Link to="/results-overview" className="btn btn-secondary">
            <ChartBarIcon className="w-4 h-4 ml-1" />
            النتائج التفصيلية
          </Link>
          <Link to="/tests/new" className="btn btn-primary">
            <ClipboardDocumentListIcon className="w-4 h-4 ml-1" />
            إنشاء تقييم
          </Link>
        </div>
      </div>

      {/* Quick Stats Row 1 - Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 bg-gradient-to-bl from-primary-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <UserGroupIcon className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-700">{summary.total_employees || 0}</p>
              <p className="text-xs text-slate-500">إجمالي الموظفين</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-4 bg-gradient-to-bl from-accent-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-100 rounded-lg">
              <BuildingOffice2Icon className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-600">
                {(Number(summary.sectors_count) || 0) + (Number(summary.departments_count) || 0) + (Number(summary.sections_count) || 0)}
              </p>
              <p className="text-xs text-slate-500">الأقسام والإدارات</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-4 bg-gradient-to-bl from-blue-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <PresentationChartBarIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${
                (summary.organization_avg_score || 0) >= 70 ? 'text-success-600' :
                (summary.organization_avg_score || 0) >= 40 ? 'text-warning-600' : 'text-danger-600'
              }`}>
                {summary.organization_avg_score || 0}%
              </p>
              <p className="text-xs text-slate-500">متوسط الأداء العام</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card p-4 bg-gradient-to-bl from-success-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-100 rounded-lg">
              <CheckCircleIcon className="w-5 h-5 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success-600">{summary.analyzed_count || 0}</p>
              <p className="text-xs text-slate-500">تقييم محلل</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-4 bg-gradient-to-bl from-warning-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning-100 rounded-lg">
              <ExclamationTriangleIcon className="w-5 h-5 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning-600">{summary.skills_with_gaps || 0}</p>
              <p className="text-xs text-slate-500">مهارة تحتاج تطوير</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-4 bg-gradient-to-bl from-purple-50 to-white"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <AcademicCapIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{summary.active_recommendations || 0}</p>
              <p className="text-xs text-slate-500">توصية تدريبية</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'نظرة عامة', icon: Squares2X2Icon },
          { id: 'departments', label: 'الأقسام', icon: BuildingOffice2Icon },
          { id: 'performers', label: 'الأداء', icon: TrophyIcon },
          { id: 'training', label: 'الاحتياجات التدريبية', icon: LightBulbIcon },
          { id: 'badges', label: 'الأوسمة والإنجازات', icon: SparklesIcon },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              activeSection === tab.id
                ? 'bg-primary-100 text-primary-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Distribution */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5" />
                توزيع مستويات الأداء
              </h2>
              {scoreDistribution.length > 0 ? (
                <ScoreDistributionChart data={scoreDistribution} />
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">
                  <p className="text-center">لا توجد بيانات كافية</p>
                </div>
              )}
            </div>

            {/* Assessment Trends */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5" />
                اتجاه التقييمات (آخر 6 أشهر)
              </h2>
              {assessmentTrends.length > 0 ? (
                <AssessmentTrendsChart data={assessmentTrends} />
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">
                  <p className="text-center">لا توجد بيانات كافية</p>
                </div>
              )}
            </div>
          </div>

          {/* Top/Bottom Performers Quick View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Performers */}
            <div className="card">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-success-700 flex items-center gap-2">
                  <TrophyIcon className="w-5 h-5" />
                  أفضل الموظفين أداءً
                </h2>
                <button 
                  onClick={() => setActiveSection('performers')}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  عرض الكل
                </button>
              </div>
              <div className="p-4 space-y-2">
                {topPerformers.slice(0, 5).map((user, idx) => (
                  <PerformerCard key={user.id} user={user} rank={idx + 1} isTop={true} />
                ))}
                {topPerformers.length === 0 && (
                  <p className="text-center text-slate-400 py-4">لا توجد بيانات</p>
                )}
              </div>
            </div>

            {/* Bottom Performers */}
            <div className="card">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-warning-700 flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  يحتاجون تطوير
                </h2>
                <button 
                  onClick={() => setActiveSection('performers')}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  عرض الكل
                </button>
              </div>
              <div className="p-4 space-y-2">
                {bottomPerformers.slice(0, 5).map((user, idx) => (
                  <PerformerCard key={user.id} user={user} rank={idx + 1} isTop={false} />
                ))}
                {bottomPerformers.length === 0 && (
                  <p className="text-center text-slate-400 py-4">لا توجد بيانات</p>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary-700 flex items-center gap-2">
                <ClockIcon className="w-5 h-5" />
                آخر النشاطات
              </h2>
              <Link to="/results-overview" className="text-sm text-primary-600 hover:text-primary-700">
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
                    <th>المجال</th>
                    <th>النتيجة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.length > 0 ? (
                    recentActivity.slice(0, 10).map((activity) => (
                      <tr key={activity.id}>
                        <td className="font-medium">{activity.user_name_ar}</td>
                        <td className="text-slate-500">{activity.department_name_ar || '-'}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span>{activity.test_title_ar}</span>
                            {activity.needs_grading && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                                <ExclamationTriangleIcon className="w-3 h-3" />
                                يحتاج تقييم ({activity.ungraded_count})
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{ 
                              backgroundColor: (activity.domain_color || '#502390') + '20',
                              color: activity.domain_color || '#502390'
                            }}
                          >
                            {activity.domain_name_ar}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <span className={`badge ${
                              activity.overall_score >= 70 ? 'badge-success' : 
                              activity.overall_score >= 40 ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {activity.overall_score}%
                            </span>
                            {activity.needs_grading && (
                              <span className="text-xs text-amber-600">(غير نهائية)</span>
                            )}
                          </div>
                        </td>
                        <td className="text-slate-500 text-sm">{formatDate(activity.analyzed_at)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center text-slate-500 py-8">
                        لا توجد نشاطات حديثة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Departments Section */}
      {activeSection === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary-700">تحليل الأقسام والإدارات</h2>
            <p className="text-sm text-slate-500">{activeDepartments.length} قسم/إدارة نشطة</p>
          </div>
          
          {activeDepartments.length > 0 ? (
            <div className="space-y-3">
              {activeDepartments.map(dept => (
                <DepartmentCard
                  key={dept.id}
                  department={dept}
                  skillsData={skillsByDept}
                  isExpanded={expandedDept === dept.id}
                  onToggle={() => setExpandedDept(expandedDept === dept.id ? null : dept.id)}
                />
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <BuildingOffice2Icon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">لا توجد أقسام تحتوي على موظفين</p>
            </div>
          )}
        </div>
      )}

      {/* Performers Section */}
      {activeSection === 'performers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Performers Full List */}
          <div className="card">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-success-50 to-white">
              <h2 className="text-lg font-semibold text-success-700 flex items-center gap-2">
                <TrophyIcon className="w-5 h-5" />
                أفضل 10 موظفين أداءً
              </h2>
              <p className="text-sm text-slate-500 mt-1">بناءً على متوسط نتائج التقييمات</p>
            </div>
            <div className="p-4 space-y-2">
              {topPerformers.map((user, idx) => (
                <PerformerCard key={user.id} user={user} rank={idx + 1} isTop={true} />
              ))}
              {topPerformers.length === 0 && (
                <p className="text-center text-slate-400 py-8">لا توجد بيانات كافية</p>
              )}
            </div>
          </div>

          {/* Bottom Performers Full List */}
          <div className="card">
            <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-warning-50 to-white">
              <h2 className="text-lg font-semibold text-warning-700 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                موظفون يحتاجون تطوير
              </h2>
              <p className="text-sm text-slate-500 mt-1">أولوية للتدريب والتطوير</p>
            </div>
            <div className="p-4 space-y-2">
              {bottomPerformers.map((user, idx) => (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-l from-warning-50 to-white">
                  <div className="w-8 h-8 rounded-full bg-warning-200 flex items-center justify-center text-warning-700 font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{user.name_ar}</p>
                    <p className="text-xs text-slate-500 truncate">{user.department_name_ar || '-'}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-warning-600">{user.avg_score}%</p>
                    <p className="text-xs text-slate-400">{user.pending_recommendations || 0} توصية</p>
                  </div>
                </div>
              ))}
              {bottomPerformers.length === 0 && (
                <p className="text-center text-slate-400 py-8">لا توجد بيانات كافية</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Training Needs Section */}
      {activeSection === 'training' && (
        <div className="space-y-6">
          {/* Priority Skills */}
          <div className="card">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-primary-700 flex items-center gap-2">
                <LightBulbIcon className="w-5 h-5" />
                أولويات التدريب - المهارات الأضعف
              </h2>
              <p className="text-sm text-slate-500 mt-1">المهارات التي تحتاج تطوير على مستوى المنظمة</p>
            </div>
            <div className="p-4">
              {trainingNeeds.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trainingNeeds.slice(0, 12).map((skill, idx) => (
                    <motion.div
                      key={skill.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="p-4 rounded-xl border border-slate-200 hover:border-primary-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: skill.domain_color || '#502390' }}
                          />
                          <span className="text-xs text-slate-500">{skill.domain_name_ar}</span>
                        </div>
                        <span className={`text-sm font-bold ${
                          skill.avg_score >= 50 ? 'text-warning-600' : 'text-danger-600'
                        }`}>
                          {skill.avg_score}%
                        </span>
                      </div>
                      <h3 className="font-medium text-slate-800 mb-2">{skill.name_ar}</h3>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-danger-500"></span>
                          {skill.low_count || 0} ضعيف
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-warning-500"></span>
                          {skill.medium_count || 0} متوسط
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-success-500"></span>
                          {skill.high_count || 0} جيد
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400">{skill.total_assessed} موظف مقيّم</span>
                        <span className="text-xs text-primary-600">{skill.active_recommendations || 0} توصية</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-8">لا توجد بيانات كافية</p>
              )}
            </div>
          </div>

          {/* Departments with Highest Training Needs */}
          <div className="card">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-warning-700 flex items-center gap-2">
                <BuildingOffice2Icon className="w-5 h-5" />
                الأقسام الأكثر احتياجاً للتدريب
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>القسم/الإدارة</th>
                    <th>عدد الموظفين</th>
                    <th>متوسط الأداء</th>
                    <th>نسبة المهارات الضعيفة</th>
                    <th>التوصيات المعلقة</th>
                  </tr>
                </thead>
                <tbody>
                  {deptsTrainingNeeds.length > 0 ? (
                    deptsTrainingNeeds.map(dept => (
                      <tr key={dept.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-warning-100 rounded-lg flex items-center justify-center">
                              <BuildingOffice2Icon className="w-4 h-4 text-warning-600" />
                            </div>
                            <div>
                              <p className="font-medium">{dept.name_ar}</p>
                              <p className="text-xs text-slate-500">
                                {dept.type === 'sector' ? 'قطاع' : dept.type === 'department' ? 'إدارة' : 'قسم'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-slate-600">{dept.employee_count}</td>
                        <td>
                          <span className={`badge ${
                            (dept.avg_assessment_score || 0) >= 70 ? 'badge-success' :
                            (dept.avg_assessment_score || 0) >= 40 ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {dept.avg_assessment_score || 0}%
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-danger-500 rounded-full"
                                style={{ width: `${dept.low_skill_percentage || 0}%` }}
                              />
                            </div>
                            <span className="text-sm text-danger-600 font-medium">
                              {dept.low_skill_percentage || 0}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="text-primary-600 font-medium">{dept.pending_recommendations || 0}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center text-slate-500 py-8">
                        لا توجد بيانات كافية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Badges Section */}
      {activeSection === 'badges' && (
        <div className="space-y-6">
          {/* Badges Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-4 bg-gradient-to-bl from-amber-50 to-white"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <SparklesIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{badgeStats.total_with_badges}</p>
                  <p className="text-xs text-slate-500">موظفون حاصلون على أوسمة</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="card p-4 bg-gradient-to-bl from-purple-50 to-white"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <UserGroupIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">{badgeStats.total_employees}</p>
                  <p className="text-xs text-slate-500">إجمالي الموظفين</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card p-4 bg-gradient-to-bl from-success-50 to-white"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success-100 rounded-lg">
                  <TrophyIcon className="w-5 h-5 text-success-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-success-600">
                    {badgeStats.total_employees > 0 
                      ? Math.round((badgeStats.total_with_badges / badgeStats.total_employees) * 100) 
                      : 0}%
                  </p>
                  <p className="text-xs text-slate-500">نسبة الحاصلين على أوسمة</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card p-4 bg-gradient-to-bl from-blue-50 to-white"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <StarIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{Object.keys(badgeSummary).length}</p>
                  <p className="text-xs text-slate-500">أنواع أوسمة ممنوحة</p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Badge Rules Card */}
            <div className="lg:col-span-1">
              <BadgeRulesCard badgeDefinitions={badgeDefinitions} categories={badgeCategories} />
            </div>

            {/* Employees with Badges */}
            <div className="lg:col-span-2">
              <div className="card">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-l from-amber-50 to-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <TrophyIcon className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-amber-700">الموظفون الحاصلون على أوسمة</h2>
                        <p className="text-sm text-slate-500">{employeesWithBadges.length} موظف</p>
                      </div>
                    </div>
                    
                    {/* Badge Type Filter */}
                    <select
                      value={badgeFilterType}
                      onChange={(e) => setBadgeFilterType(e.target.value)}
                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="all">جميع الأوسمة</option>
                      {badgeDefinitions?.map(badge => (
                        <option key={badge.id} value={badge.id}>{badge.title_ar}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Badge Distribution Summary */}
                {Object.keys(badgeSummary).length > 0 && (
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-600 mb-3">توزيع الأوسمة</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      {Object.entries(badgeSummary).map(([badgeId, count]) => {
                        const badge = badgeDefinitions?.find(b => b.id === badgeId);
                        return (
                          <BadgeSummaryCard 
                            key={badgeId} 
                            badgeId={badgeId} 
                            count={count} 
                            badge={badge}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Employees List */}
                <div className="p-4">
                  {employeesWithBadges.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                      {employeesWithBadges
                        .filter(emp => 
                          badgeFilterType === 'all' || 
                          emp.badges.some(b => b.id === badgeFilterType)
                        )
                        .map((employee, idx) => (
                          <EmployeeBadgeCard 
                            key={employee.user_id} 
                            employee={employee} 
                            index={idx}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <SparklesIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-600 mb-2">لا يوجد موظفون حاصلون على أوسمة</h3>
                      <p className="text-slate-500">سيظهر هنا الموظفون عند استيفائهم لشروط الأوسمة</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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

