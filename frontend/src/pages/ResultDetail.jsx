import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  AcademicCapIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import api from '../utils/api';
import { formatDate, getSkillLevelLabel, getSkillLevelColor } from '../utils/helpers';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

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

  const skillScores = result.skill_scores || {};
  const strengths = result.strengths || [];
  const gaps = result.gaps || [];
  const recommendations = result.recommendations || [];
  const openTextAnalysis = result.open_text_analysis || {};

  // Prepare radar chart data
  const skillNames = Object.entries(skillScores).map(([, data]) => data?.name_ar || 'مهارة');
  const skillValues = Object.values(skillScores).map(data => data?.score || 0);
  
  const radarData = {
    labels: skillNames.slice(0, 8),
    datasets: [{
      label: 'مستوى المهارة',
      data: skillValues.slice(0, 8),
      backgroundColor: 'rgba(14, 57, 94, 0.2)',
      borderColor: 'rgba(14, 57, 94, 0.8)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(14, 57, 94, 1)',
    }],
  };

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
          style={{ backgroundColor: result.domain_color || '#0e395e' }}
        ></div>
        <div className="p-8 text-center">
          <div 
            className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ 
              backgroundColor: (result.domain_color || '#0e395e') + '20',
              border: `4px solid ${result.domain_color || '#0e395e'}`
            }}
          >
            <span 
              className="text-4xl font-bold"
              style={{ color: result.domain_color || '#0e395e' }}
            >
              {result.overall_score}%
            </span>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">النتيجة الإجمالية</h2>
          <p className="text-slate-500 max-w-md mx-auto">
            {result.overall_score >= 70 
              ? 'أداء ممتاز! أنت تمتلك مهارات قوية في هذا المجال'
              : result.overall_score >= 40
                ? 'أداء جيد مع وجود فرص للتحسين'
                : 'هناك حاجة لتطوير المهارات في هذا المجال'}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skills Radar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-primary-700 mb-4">ملف المهارات</h3>
          {skillNames.length > 0 ? (
            <div className="aspect-square">
              <Radar
                data={radarData}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 100,
                      ticks: { display: false },
                      grid: { color: 'rgba(0,0,0,0.05)' },
                      pointLabels: {
                        font: { family: 'IBM Plex Sans Arabic', size: 11 },
                        color: '#475569'
                      }
                    }
                  },
                  plugins: {
                    legend: { display: false }
                  }
                }}
              />
            </div>
          ) : (
            <div className="aspect-square flex items-center justify-center text-slate-400">
              لا توجد بيانات كافية
            </div>
          )}
        </motion.div>

        {/* Skill Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <h3 className="text-lg font-semibold text-primary-700 mb-4">تفاصيل المهارات</h3>
          <div className="space-y-4">
            {Object.entries(skillScores).map(([skillId, data], index) => (
              <div key={skillId} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{data?.name_ar || `مهارة ${index + 1}`}</span>
                    <span className={`badge text-xs ${getSkillLevelColor(data?.level)}`}>
                      {getSkillLevelLabel(data?.level)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        data?.level === 'high' ? 'bg-success-500' :
                        data?.level === 'medium' ? 'bg-warning-500' : 'bg-danger-500'
                      }`}
                      style={{ width: `${data?.score || 0}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-600 w-12 text-left">
                  {data?.score || 0}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Strengths & Gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <CheckCircleIcon className="w-6 h-6 text-success-600" />
            <h3 className="text-lg font-semibold text-primary-700">نقاط القوة</h3>
          </div>
          {strengths.length > 0 ? (
            <div className="space-y-3">
              {strengths.map((strength, index) => (
                <div key={index} className="p-3 bg-success-50 rounded-xl">
                  <p className="font-medium text-success-800">{strength.skill_name_ar}</p>
                  <p className="text-sm text-success-600 mt-1">{strength.description_ar}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-4">لم يتم تحديد نقاط قوة محددة</p>
          )}
        </motion.div>

        {/* Gaps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <ExclamationCircleIcon className="w-6 h-6 text-warning-600" />
            <h3 className="text-lg font-semibold text-primary-700">فجوات المهارات</h3>
          </div>
          {gaps.length > 0 ? (
            <div className="space-y-3">
              {gaps.map((gap, index) => (
                <div key={index} className="p-3 bg-warning-50 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-warning-800">{gap.skill_name_ar}</p>
                    <span className="text-xs text-warning-600 bg-warning-100 px-2 py-1 rounded">
                      فجوة {gap.gap_score}%
                    </span>
                  </div>
                  <p className="text-sm text-warning-600">{gap.description_ar}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-4">لا توجد فجوات محددة</p>
          )}
        </motion.div>
      </div>

      {/* AI Summary */}
      {(result.ai_summary_ar || result.ai_recommendations_ar) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="w-6 h-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary-700">تحليل الذكاء الاصطناعي</h3>
          </div>
          
          {result.ai_summary_ar && (
            <div className="mb-4">
              <h4 className="font-medium text-slate-700 mb-2">الملخص</h4>
              <p className="text-slate-600 leading-relaxed">{result.ai_summary_ar}</p>
            </div>
          )}
          
          {result.ai_recommendations_ar && (
            <div>
              <h4 className="font-medium text-slate-700 mb-2">التوصيات</h4>
              <p className="text-slate-600 leading-relaxed">{result.ai_recommendations_ar}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Training Recommendations */}
      {recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <AcademicCapIcon className="w-6 h-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary-700">التوصيات التدريبية</h3>
          </div>
          
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-medium text-slate-800">{rec.course_title_ar}</h4>
                    <p className="text-sm text-slate-500 mt-1">{rec.course_description_ar}</p>
                    {rec.skill_name_ar && (
                      <span className="inline-block mt-2 text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded">
                        {rec.skill_name_ar}
                      </span>
                    )}
                  </div>
                  {rec.course_url && (
                    <a
                      href={rec.course_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary text-sm py-2 shrink-0"
                    >
                      عرض الدورة
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

