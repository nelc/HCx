import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { formatDate, getSkillLevelLabel, getSkillLevelColor } from '../utils/helpers';

export default function MyResults() {
  const { user } = useAuthStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await api.get(`/analysis/user/${user.id}`);
      setResults(response.data || []);
    } catch (error) {
      console.error('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  // Calculate average score
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.overall_score || 0), 0) / results.length)
    : 0;

  // Get improvement trend
  const getImprovementTrend = () => {
    if (results.length < 2) return null;
    const recent = results.slice(0, 3).map(r => r.overall_score || 0);
    const older = results.slice(-3).map(r => r.overall_score || 0);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    return recentAvg - olderAvg;
  };

  const trend = getImprovementTrend();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">نتائجي</h1>
        <p className="text-slate-500">تتبع أدائك وتطور مهاراتك</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 rounded-xl">
              <ChartBarIcon className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-700">{results.length}</p>
              <p className="text-sm text-slate-500">إجمالي التقييمات</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-50 rounded-xl">
              <TrophyIcon className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-600">{avgScore}%</p>
              <p className="text-sm text-slate-500">متوسط الأداء</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${trend && trend > 0 ? 'bg-success-50' : trend && trend < 0 ? 'bg-danger-50' : 'bg-slate-100'}`}>
              {trend && trend > 0 ? (
                <ArrowTrendingUpIcon className="w-6 h-6 text-success-600" />
              ) : trend && trend < 0 ? (
                <ArrowTrendingDownIcon className="w-6 h-6 text-danger-600" />
              ) : (
                <ChartBarIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div>
              <p className={`text-3xl font-bold ${trend && trend > 0 ? 'text-success-600' : trend && trend < 0 ? 'text-danger-600' : 'text-slate-400'}`}>
                {trend ? `${trend > 0 ? '+' : ''}${Math.round(trend)}%` : '-'}
              </p>
              <p className="text-sm text-slate-500">مؤشر التحسن</p>
            </div>
          </div>
        </div>
      </div>

      {/* Results list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-32"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ChartBarIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد نتائج بعد</h3>
          <p className="text-slate-500 mb-4">أكمل تقييماتك لتظهر نتائجك هنا</p>
          <Link to="/assessments" className="btn btn-primary inline-flex">
            عرض التقييمات المتاحة
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result, index) => {
            const strengths = result.strengths || [];
            const gaps = result.gaps || [];
            
            return (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card overflow-hidden"
              >
                <div 
                  className="h-1"
                  style={{ backgroundColor: result.domain_color || '#0e395e' }}
                ></div>
                
                <div className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                    {/* Score */}
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (result.domain_color || '#0e395e') + '20' }}
                    >
                      <span 
                        className="text-3xl font-bold"
                        style={{ color: result.domain_color || '#0e395e' }}
                      >
                        {result.overall_score}%
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="font-semibold text-lg text-slate-800">{result.test_title_ar}</h3>
                          <p className="text-slate-500">{result.domain_name_ar}</p>
                          <p className="text-sm text-slate-400 mt-1">{formatDate(result.analyzed_at)}</p>
                        </div>
                        <Link
                          to={`/results/${result.id}`}
                          className="btn btn-secondary text-sm py-2 shrink-0"
                        >
                          عرض التفاصيل
                        </Link>
                      </div>
                      
                      {/* Quick summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Strengths */}
                        <div className="p-3 bg-success-50 rounded-xl">
                          <p className="text-xs font-medium text-success-600 mb-2">نقاط القوة</p>
                          <div className="flex flex-wrap gap-1">
                            {strengths.slice(0, 3).map((s, i) => (
                              <span key={i} className="text-xs text-success-700 bg-success-100 px-2 py-1 rounded">
                                {s.skill_name_ar}
                              </span>
                            ))}
                            {strengths.length === 0 && (
                              <span className="text-xs text-success-600">لا توجد بيانات</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Gaps */}
                        <div className="p-3 bg-warning-50 rounded-xl">
                          <p className="text-xs font-medium text-warning-600 mb-2">فجوات المهارات</p>
                          <div className="flex flex-wrap gap-1">
                            {gaps.slice(0, 3).map((g, i) => (
                              <span key={i} className="text-xs text-warning-700 bg-warning-100 px-2 py-1 rounded">
                                {g.skill_name_ar}
                              </span>
                            ))}
                            {gaps.length === 0 && (
                              <span className="text-xs text-warning-600">لا توجد فجوات</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

