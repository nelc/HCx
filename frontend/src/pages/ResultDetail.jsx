import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
  AcademicCapIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import { formatDate } from '../utils/helpers';
import WeightedScoreBreakdown from '../components/WeightedScoreBreakdown';

export default function ResultDetail() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResult();
  }, [id]);

  const fetchResult = async () => {
    try {
      // Try by analysis ID first, then by assignment ID
      let response;
      try {
        response = await api.get(`/analysis/${id}`);
      } catch {
        response = await api.get(`/analysis/assignment/${id}`);
      }
      setResult(response.data);
    } catch (error) {
      console.error('Failed to fetch result');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري تحميل النتائج...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card p-12 text-center">
        <ExclamationCircleIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">لم يتم العثور على النتائج</h3>
        <p className="text-slate-500 mb-4">قد لا يكون التحليل قد اكتمل بعد</p>
        <Link to="/my-results" className="btn btn-primary inline-flex">
          العودة إلى نتائجي
        </Link>
      </div>
    );
  }

  const weightedBreakdown = result.weighted_breakdown || [];
  const weightedTotals = result.weighted_totals || null;
  
  // Use weighted percentage as the actual score (not the stored overall_score which might be based on skills)
  const actualScore = weightedTotals?.weighted_percentage || result.overall_score || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Link to="/my-results" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowRightIcon className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-primary-700">{result.test_title_ar}</h1>
          <p className="text-slate-500">{result.domain_name_ar} • {formatDate(result.analyzed_at)}</p>
        </div>
      </div>

      {/* Overall Score Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        <div 
          className="h-2"
          style={{ backgroundColor: result.domain_color || '#502390' }}
        ></div>
        <div className="p-8 text-center">
          <div 
            className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ 
              backgroundColor: (result.domain_color || '#502390') + '20',
              border: `4px solid ${result.domain_color || '#502390'}`
            }}
          >
            <span 
              className="text-4xl font-bold"
              style={{ color: result.domain_color || '#502390' }}
            >
              {actualScore}%
            </span>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">النتيجة الإجمالية</h2>
          <p className="text-slate-500 max-w-md mx-auto">
            {actualScore >= 70 
              ? 'أداء ممتاز! أنت تمتلك مهارات قوية في هذا المجال'
              : actualScore >= 40
                ? 'أداء جيد مع وجود فرص للتحسين'
                : 'هناك حاجة لتطوير المهارات في هذا المجال'}
          </p>
        </div>
      </motion.div>

      {/* Weighted Score Breakdown */}
      {weightedBreakdown.length > 0 && (
        <WeightedScoreBreakdown breakdown={weightedBreakdown} totals={weightedTotals} />
      )}

      {/* Action Items and Next Steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="card p-6 bg-gradient-to-br from-primary-50 to-accent-50 border-primary-100"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <SparklesIcon className="w-6 h-6 text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-primary-700 mb-3">الخطوات التالية الموصى بها</h3>
            <div className="space-y-3">
              {actualScore < 70 && (
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                  <div className="p-2 bg-warning-50 rounded-lg">
                    <ExclamationCircleIcon className="w-5 h-5 text-warning-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">ركز على تحسين مهاراتك</p>
                    <p className="text-sm text-slate-600 mt-1">
                      راجع الأسئلة التي حصلت فيها على درجات منخفضة وحاول تطوير هذه المهارات
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                <div className="p-2 bg-accent-50 rounded-lg">
                  <AcademicCapIcon className="w-5 h-5 text-accent-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">ابحث عن الدورات التدريبية المناسبة</p>
                  <p className="text-sm text-slate-600 mt-1">
                    استكشف الدورات التدريبية المتاحة لتحسين مهاراتك
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <ChartBarIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">تابع تطورك في لوحة التحليلات</p>
                  <p className="text-sm text-slate-600 mt-1">
                    راجع رحلة التعلم ومصفوفة الكفاءات لرؤية تقدمك
                  </p>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/analytics" className="btn btn-primary text-sm">
                عرض التحليلات الشاملة
              </Link>
              <Link to="/recommendations" className="btn btn-secondary text-sm">
                جميع التوصيات
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

