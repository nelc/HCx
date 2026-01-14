import { motion } from 'framer-motion';
import {
  ScaleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

export default function WeightedScoreBreakdown({ breakdown, totals }) {
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  const getQuestionTypeLabel = (type) => {
    const labels = {
      'mcq': 'اختيار من متعدد',
      'likert_scale': 'مقياس ليكرت',
      'self_rating': 'تقييم ذاتي',
      'open_text': 'نص مفتوح'
    };
    return labels[type] || type;
  };

  const getScoreColor = (percentage) => {
    if (percentage >= 70) return 'text-success-600 bg-success-50';
    if (percentage >= 40) return 'text-warning-600 bg-warning-50';
    return 'text-danger-600 bg-danger-50';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="card p-6"
    >
      <div className="flex items-center gap-2 mb-6">
        <ScaleIcon className="w-6 h-6 text-primary-600" />
        <h3 className="text-lg font-semibold text-primary-700">تفصيل الدرجات المرجحة</h3>
      </div>

      <div className="mb-6 p-4 bg-primary-50 rounded-xl border border-primary-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-primary-600 mb-1">إجمالي النقاط المرجحة</p>
            <p className="text-2xl font-bold text-primary-700">
              {totals?.total_weighted_score || 0} / {totals?.total_weighted_max_score || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-primary-600 mb-1">النسبة المئوية النهائية</p>
            <p className="text-2xl font-bold text-primary-700">
              {totals?.weighted_percentage || 0}%
            </p>
          </div>
          <div>
            <p className="text-sm text-primary-600 mb-1">عدد الأسئلة</p>
            <p className="text-2xl font-bold text-primary-700">
              {breakdown.length}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {breakdown.map((question, index) => (
          <motion.div
            key={question.question_id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * index }}
            className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-primary-200 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Question Number & Status */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary-700">{index + 1}</span>
                </div>
                {question.is_correct !== null && (
                  question.is_correct ? (
                    <CheckCircleIcon className="w-5 h-5 text-success-600" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-danger-600" />
                  )
                )}
              </div>

              {/* Question Details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 line-clamp-2 mb-1">
                      {question.question_ar || 'سؤال ' + (index + 1)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">
                        {getQuestionTypeLabel(question.question_type)}
                      </span>
                      {question.skill_name_ar && (
                        <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded">
                          {question.skill_name_ar}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  {/* Weight */}
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">الوزن</p>
                    <p className="text-base font-semibold text-slate-800">
                      ×{question.weight}
                    </p>
                  </div>

                  {/* Raw Score */}
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">النقاط الخام</p>
                    <p className="text-base font-semibold text-slate-800">
                      {question.raw_score} / {question.max_score}
                    </p>
                  </div>

                  {/* Weighted Score */}
                  <div className="p-2 bg-accent-50 rounded-lg border border-accent-200">
                    <p className="text-xs text-accent-600 mb-1">النقاط المرجحة</p>
                    <p className="text-base font-bold text-accent-700">
                      {question.weighted_score} / {question.weighted_max_score}
                    </p>
                  </div>

                  {/* Percentage */}
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">النسبة</p>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-semibold ${getScoreColor(question.percentage)}`}>
                      {question.percentage}%
                    </span>
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="mt-3">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        question.percentage >= 70 ? 'bg-success-500' :
                        question.percentage >= 40 ? 'bg-warning-500' : 'bg-danger-500'
                      }`}
                      style={{ width: `${Math.min(100, question.percentage)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

