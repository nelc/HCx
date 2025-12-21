import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  TrophyIcon,
  AcademicCapIcon,
  UserGroupIcon,
  SparklesIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Radar } from 'react-chartjs-2';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { formatDate } from '../utils/helpers';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Title,
  Tooltip,
  Legend
);

export default function Analytics() {
  const { user } = useAuthStore();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, skills, domains, journey

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get(`/analysis/analytics/${user.id}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري تحميل التحليلات...</p>
        </div>
      </div>
    );
  }

  if (!analytics || analytics.total_assessments === 0) {
    return (
      <div className="card p-12 text-center">
        <ChartBarIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">لا توجد بيانات كافية</h3>
        <p className="text-slate-500 mb-4">أكمل بعض التقييمات لعرض التحليلات الشاملة</p>
      </div>
    );
  }

  const {
    total_assessments,
    overall_average,
    improvement_rate,
    learning_velocity,
    skill_trends,
    domain_performance,
    strengths_overview,
    priority_gaps,
    peer_comparison,
    timeline,
  } = analytics;

  // Timeline chart data
  const timelineData = {
    labels: timeline.map(t => new Date(t.date).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' })),
    datasets: [
      {
        label: 'النتيجة الإجمالية',
        data: timeline.map(t => t.score),
        borderColor: '#502390',
        backgroundColor: 'rgba(80, 35, 144, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  // Domain performance bar chart
  const domainData = {
    labels: domain_performance.map(d => d.name_ar),
    datasets: [
      {
        label: 'متوسط الأداء',
        data: domain_performance.map(d => d.average_score),
        backgroundColor: domain_performance.map(d => d.color || '#502390'),
        borderRadius: 8,
      },
    ],
  };

  // Skills radar chart (top 8 skills)
  const topSkills = skill_trends.slice(0, 8);
  const skillRadarData = {
    labels: topSkills.map(s => s.name_ar),
    datasets: [
      {
        label: 'المستوى الحالي',
        data: topSkills.map(s => s.latest_score),
        backgroundColor: 'rgba(80, 35, 144, 0.2)',
        borderColor: '#502390',
        borderWidth: 2,
        pointBackgroundColor: '#502390',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: {
          color: 'rgba(0,0,0,0.05)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const getTrendIcon = (trend) => {
    if (trend === 'improving') return <ArrowTrendingUpIcon className="w-4 h-4 text-success-600" />;
    if (trend === 'declining') return <ArrowTrendingDownIcon className="w-4 h-4 text-danger-600" />;
    return <ArrowPathIcon className="w-4 h-4 text-slate-400" />;
  };

  const getTrendColor = (trend) => {
    if (trend === 'improving') return 'text-success-600 bg-success-50';
    if (trend === 'declining') return 'text-danger-600 bg-danger-50';
    return 'text-slate-600 bg-slate-50';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">تحليلات الأداء</h1>
        <p className="text-slate-500">رؤية شاملة لتطور مهاراتك وأدائك</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 rounded-xl">
              <ChartBarIcon className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-700">{total_assessments}</p>
              <p className="text-sm text-slate-500">إجمالي التقييمات</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-50 rounded-xl">
              <TrophyIcon className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-600">{overall_average}%</p>
              <p className="text-sm text-slate-500">متوسط الأداء</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${improvement_rate >= 0 ? 'bg-success-50' : 'bg-danger-50'}`}>
              {improvement_rate >= 0 ? (
                <ArrowTrendingUpIcon className="w-6 h-6 text-success-600" />
              ) : (
                <ArrowTrendingDownIcon className="w-6 h-6 text-danger-600" />
              )}
            </div>
            <div>
              <p className={`text-3xl font-bold ${improvement_rate >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                {improvement_rate >= 0 ? '+' : ''}{improvement_rate}%
              </p>
              <p className="text-sm text-slate-500">معدل التحسن</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-secondary-50 rounded-xl">
              <SparklesIcon className="w-6 h-6 text-secondary-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-secondary-600">{learning_velocity}</p>
              <p className="text-sm text-slate-500">سرعة التعلم</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Peer Comparison */}
      {peer_comparison && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <UserGroupIcon className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary-700">المقارنة مع الأقران</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500 mb-1">أدائك</p>
              <p className="text-2xl font-bold text-primary-700">{overall_average}%</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500 mb-1">متوسط القسم</p>
              <p className="text-2xl font-bold text-slate-700">{peer_comparison.department_average}%</p>
            </div>
            <div className="text-center p-4 bg-primary-50 rounded-xl">
              <p className="text-sm text-primary-600 mb-1">الترتيب المئوي</p>
              <p className="text-2xl font-bold text-primary-700">{peer_comparison.percentile}%</p>
              <p className="text-xs text-primary-500 mt-1">من {peer_comparison.peer_count} موظف</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'overview', label: 'نظرة عامة', icon: ChartBarIcon },
            { id: 'skills', label: 'تطور المهارات', icon: SparklesIcon },
            { id: 'domains', label: 'أداء المجالات', icon: AcademicCapIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 pb-3 px-1 border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }
              `}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Timeline Chart */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary-700 mb-4">مسار التطور</h3>
            <div className="h-64">
              <Line data={timelineData} options={chartOptions} />
            </div>
          </div>

          {/* Strengths & Gaps Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Strengths */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrophyIcon className="w-5 h-5 text-success-600" />
                <h3 className="text-lg font-semibold text-primary-700">نقاط القوة الرئيسية</h3>
              </div>
              <div className="space-y-3">
                {strengths_overview.slice(0, 5).map((strength, index) => (
                  <div key={index} className="p-3 bg-success-50 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-success-800">{strength.skill_name_ar}</p>
                      <span className="text-xs bg-success-100 text-success-700 px-2 py-1 rounded">
                        {strength.consistency}% ثبات
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-success-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-success-500 rounded-full"
                          style={{ width: `${strength.avg_score}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-success-700">{strength.avg_score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Gaps */}
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <ChartBarIcon className="w-5 h-5 text-warning-600" />
                <h3 className="text-lg font-semibold text-primary-700">فجوات تحتاج انتباه</h3>
              </div>
              <div className="space-y-3">
                {priority_gaps.slice(0, 5).map((gap, index) => (
                  <div key={index} className="p-3 bg-warning-50 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-warning-800">{gap.skill_name_ar}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs bg-warning-100 text-warning-700 px-2 py-1 rounded">
                          فجوة {gap.avg_gap}%
                        </span>
                        {gap.persistence > 50 && (
                          <span className="text-xs bg-danger-100 text-danger-700 px-2 py-1 rounded">
                            متكرر
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-warning-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-warning-500 rounded-full"
                          style={{ width: `${gap.avg_gap}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-semibold text-warning-700">{gap.persistence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'skills' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Skills Radar */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary-700 mb-4">ملف المهارات الشامل</h3>
            <div className="h-80">
              <Radar
                data={skillRadarData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 100,
                      ticks: { stepSize: 20 },
                      pointLabels: {
                        font: { family: 'IBM Plex Sans Arabic', size: 12 },
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Detailed Skills List */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary-700 mb-4">تفاصيل جميع المهارات</h3>
            <div className="space-y-3">
              {skill_trends.map((skill, index) => (
                <div key={index} className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-slate-800">{skill.name_ar}</h4>
                      <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${getTrendColor(skill.trend)}`}>
                        {getTrendIcon(skill.trend)}
                        {skill.trend === 'improving' ? 'يتحسن' : skill.trend === 'declining' ? 'يتراجع' : 'مستقر'}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-bold text-primary-700">{skill.latest_score}%</p>
                      {skill.change !== 0 && (
                        <p className={`text-xs ${skill.change > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          {skill.change > 0 ? '+' : ''}{skill.change}%
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${skill.latest_score}%` }}
                    ></div>
                  </div>
                  {skill.scores.length > 1 && (
                    <div className="mt-2 flex items-center gap-1">
                      {skill.scores.slice(-10).map((score, i) => (
                        <div
                          key={i}
                          className="flex-1 h-8 bg-slate-200 rounded flex items-end overflow-hidden"
                        >
                          <div
                            className="w-full bg-primary-400 rounded-t"
                            style={{ height: `${score}%` }}
                          ></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'domains' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Domain Performance Bar Chart */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-primary-700 mb-4">مقارنة أداء المجالات</h3>
            <div className="h-64">
              <Bar data={domainData} options={chartOptions} />
            </div>
          </div>

          {/* Domain Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {domain_performance.map((domain, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card overflow-hidden"
              >
                <div className="h-2" style={{ backgroundColor: domain.color }}></div>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-lg text-slate-800">{domain.name_ar}</h4>
                      <p className="text-sm text-slate-500">{domain.assessments_count} تقييم</p>
                    </div>
                    <div className="text-left">
                      <p className="text-3xl font-bold" style={{ color: domain.color }}>
                        {domain.average_score}%
                      </p>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${getTrendColor(domain.trend)}`}>
                        {getTrendIcon(domain.trend)}
                        {domain.trend === 'improving' ? 'يتحسن' : domain.trend === 'declining' ? 'يتراجع' : 'مستقر'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">آخر تقييم</span>
                      <span className="font-semibold">{domain.latest_score}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ backgroundColor: domain.color, width: `${domain.average_score}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}


















