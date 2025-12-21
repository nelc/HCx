import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  ScaleIcon,
  ChartBarIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { formatDate } from '../utils/helpers';

export default function TestResultsImmediate() {
  const { assignmentId } = useParams();
  const { user } = useAuthStore();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userCategory, setUserCategory] = useState(null);
  const [gradingScores, setGradingScores] = useState({});
  const [savingGrade, setSavingGrade] = useState({});

  useEffect(() => {
    fetchResults();
  }, [assignmentId]);

  const fetchResults = async () => {
    try {
      // Get the assignment details first
      const assignmentRes = await api.get(`/assignments/${assignmentId}`);
      const assignment = assignmentRes.data;

      // Get responses with weights
      const responsesRes = await api.get(`/responses/assignment/${assignmentId}`);
      const responses = responsesRes.data || [];

      // Calculate weighted scores
      let totalWeightedScore = 0;
      let totalWeightedMaxScore = 0;
      const breakdown = [];

      responses.forEach((response, index) => {
        const weight = parseFloat(response.weight) || 1;
        let maxScore = 10;

        // Determine max score based on question type
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options)) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        }

        const rawScore = parseFloat(response.score) || 0;
        const weightedScore = rawScore * weight;
        const weightedMaxScore = maxScore * weight;

        totalWeightedScore += weightedScore;
        totalWeightedMaxScore += weightedMaxScore;

        breakdown.push({
          response_id: response.id,
          question_number: index + 1,
          question_ar: response.question_ar,
          question_type: response.question_type,
          skill_name: response.skill_name_ar,
          response_value: response.response_value,
          weight,
          raw_score: rawScore,
          max_score: maxScore,
          weighted_score: weightedScore,
          weighted_max_score: weightedMaxScore,
          percentage: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
          is_correct: response.is_correct
        });
      });

      const finalPercentage = totalWeightedMaxScore > 0
        ? Math.round((totalWeightedScore / totalWeightedMaxScore) * 100)
        : 0;

      // Determine user category based on score
      const category = getCategoryFromScore(finalPercentage);
      setUserCategory(category);

      setResult({
        assignment,
        totalWeightedScore: Math.round(totalWeightedScore * 10) / 10,
        totalWeightedMaxScore: Math.round(totalWeightedMaxScore * 10) / 10,
        finalPercentage,
        breakdown,
        totalQuestions: responses.length,
        correctCount: responses.filter(r => r.is_correct).length
      });
    } catch (error) {
      console.error('Failed to fetch results:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Get user category based on score
  const getCategoryFromScore = (score) => {
    if (score >= 70) {
      return {
        key: 'advanced',
        label_ar: 'متقدم',
        label_en: 'Advanced',
        description_ar: 'أداء ممتاز! أنت تمتلك مهارات قوية في هذا المجال',
        description_en: 'Excellent performance, can specialize further',
        color: '#10B981',
        bgColor: '#D1FAE5',
        textColor: '#065F46'
      };
    } else if (score >= 40) {
      return {
        key: 'intermediate',
        label_ar: 'متوسط',
        label_en: 'Intermediate',
        description_ar: 'أداء جيد مع وجود فرص للتحسين',
        description_en: 'Good foundation, can develop further',
        color: '#F59E0B',
        bgColor: '#FEF3C7',
        textColor: '#92400E'
      };
    } else {
      return {
        key: 'beginner',
        label_ar: 'مبتدئ',
        label_en: 'Beginner',
        description_ar: 'هناك حاجة لتطوير المهارات في هذا المجال',
        description_en: 'Needs strong foundation in this area',
        color: '#EF4444',
        bgColor: '#FEE2E2',
        textColor: '#991B1B'
      };
    }
  };

  // Handle admin grading for open_text questions
  const handleGradeOpenText = async (responseId, percentage) => {
    try {
      setSavingGrade(prev => ({ ...prev, [responseId]: true }));
      const score = (parseFloat(percentage) / 100) * 10; // Convert percentage to 0-10 scale
      await api.patch(`/responses/${responseId}/grade`, { score, percentage: parseFloat(percentage) });
      
      // Refresh results to recalculate totals
      await fetchResults();
      setGradingScores(prev => ({ ...prev, [responseId]: undefined }));
    } catch (error) {
      console.error('Failed to save grade:', error);
    } finally {
      setSavingGrade(prev => ({ ...prev, [responseId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">جاري حساب النتيجة...</p>
          <p className="text-slate-500 text-sm mt-2">يتم تطبيق الأوزان وحساب الدرجة النهائية</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card p-12 text-center">
        <p className="text-slate-600">لم يتم العثور على النتائج</p>
        <Link to="/my-results" className="btn btn-primary mt-4 inline-flex">
          العودة إلى نتائجي
        </Link>
      </div>
    );
  }

  const getScoreColor = (percentage) => {
    if (percentage >= 70) return 'success';
    if (percentage >= 40) return 'warning';
    return 'danger';
  };

  const scoreColor = getScoreColor(result.finalPercentage);
  const domainColor = result.assignment?.domain_color || '#502390';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/my-results" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowRightIcon className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-primary-700">نتيجة التقييم</h1>
          <p className="text-slate-500">{result.assignment?.test_title_ar}</p>
        </div>
      </div>

      {/* Success Message */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-6 bg-gradient-to-br from-success-50 to-emerald-50 border-success-200"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-success-500 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircleIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-success-800 mb-1">
              تم إرسال التقييم بنجاح!
            </h3>
            <p className="text-success-700">
              تم حساب درجتك بناءً على أوزان الأسئلة. إليك النتيجة التفصيلية:
            </p>
          </div>
        </div>
      </motion.div>

      {/* Overall Score */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="card overflow-hidden"
      >
        <div className="h-2" style={{ backgroundColor: domainColor }}></div>
        <div className="p-8 text-center">
          <div
            className="w-40 h-40 rounded-full flex flex-col items-center justify-center mx-auto mb-6"
            style={{
              backgroundColor: `${domainColor}20`,
              border: `4px solid ${domainColor}`
            }}
          >
            <span className="text-5xl font-bold" style={{ color: domainColor }}>
              {result.finalPercentage}%
            </span>
            <span className="text-sm text-slate-500 mt-1">النتيجة الإجمالية</span>
          </div>
          
          <h2 className="text-2xl font-semibold text-slate-800 mb-3">
            {result.assignment?.test_title_ar}
          </h2>
          
          <p className="text-slate-600 mb-6">
            {result.assignment?.domain_name_ar} • {formatDate(new Date())}
          </p>

          {/* User Category Badge */}
          {userCategory && (
            <div className="flex flex-col items-center gap-3">
              <div 
                className="inline-flex items-center gap-3 px-6 py-3 rounded-xl font-medium"
                style={{ backgroundColor: userCategory.bgColor, color: userCategory.textColor }}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: userCategory.color }}
                >
                  {result.finalPercentage}%
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">تصنيفك: {userCategory.label_ar}</div>
                  <div className="text-sm opacity-80">{userCategory.description_ar}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Weighted Calculation Summary */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="card p-6"
      >
        <div className="flex items-center gap-2 mb-6">
          <ScaleIcon className="w-6 h-6 text-primary-600" />
          <h3 className="text-xl font-semibold text-primary-700">ملخص النتيجة المرجحة</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
            <p className="text-sm text-primary-600 mb-1">مجموع النقاط</p>
            <p className="text-3xl font-bold text-primary-700">
              {result.totalWeightedScore}
            </p>
            <p className="text-xs text-primary-600 mt-1">
              من {result.totalWeightedMaxScore}
            </p>
          </div>

          <div className="p-4 bg-accent-50 rounded-xl border border-accent-100">
            <p className="text-sm text-accent-600 mb-1">النسبة المئوية</p>
            <p className="text-3xl font-bold text-accent-700">
              {result.finalPercentage}%
            </p>
            <p className="text-xs text-accent-600 mt-1">
              الدرجة النهائية
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-600 mb-1">عدد الأسئلة</p>
            <p className="text-3xl font-bold text-slate-700">
              {result.totalQuestions}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              إجمالي الأسئلة
            </p>
          </div>

          <div className="p-4 bg-success-50 rounded-xl border border-success-100">
            <p className="text-sm text-success-600 mb-1">الإجابات الصحيحة</p>
            <p className="text-3xl font-bold text-success-700">
              {result.correctCount}
            </p>
            <p className="text-xs text-success-600 mt-1">
              من {result.totalQuestions}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Question by Question Breakdown */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="card p-6"
      >
        <div className="flex items-center gap-2 mb-6">
          <ChartBarIcon className="w-6 h-6 text-primary-600" />
          <h3 className="text-xl font-semibold text-primary-700">تفصيل الأسئلة</h3>
        </div>

        <div className="space-y-3">
          {result.breakdown.map((q, index) => (
            <div
              key={index}
              className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-primary-200 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary-700">{q.question_number}</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 mb-2 line-clamp-2">{q.question_ar}</p>
                  
                  {q.skill_name && (
                    <span className="inline-block text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded mb-2">
                      {q.skill_name}
                    </span>
                  )}

                  {/* Show open text answer */}
                  {q.question_type === 'open_text' && q.response_value && (
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">إجابة الموظف:</span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.response_value}</p>
                    </div>
                  )}

                  {/* Admin grading for open_text questions */}
                  {q.question_type === 'open_text' && user?.role === 'admin' && (
                    <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-amber-800">تقييم المدير:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder={q.percentage > 0 ? q.percentage : "0-100"}
                            value={gradingScores[q.response_id] ?? (q.percentage > 0 ? q.percentage : '')}
                            onChange={(e) => setGradingScores(prev => ({ ...prev, [q.response_id]: e.target.value }))}
                            className="w-20 px-2 py-1 text-sm border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                          />
                          <span className="text-sm text-amber-700">%</span>
                          <button
                            onClick={() => handleGradeOpenText(q.response_id, gradingScores[q.response_id] ?? q.percentage)}
                            disabled={savingGrade[q.response_id] || !gradingScores[q.response_id]}
                            className="px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingGrade[q.response_id] ? 'جاري الحفظ...' : 'حفظ'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-slate-500">الوزن:</span>
                      <span className="font-semibold text-slate-800 mr-1">×{q.weight}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-slate-500">النقاط الخام:</span>
                      <span className="font-semibold text-slate-800 mr-1">{q.raw_score}/{q.max_score}</span>
                    </div>
                    <div className="p-2 bg-accent-50 rounded border border-accent-200">
                      <span className="text-accent-600">المرجحة:</span>
                      <span className="font-bold text-accent-700 mr-1">{Math.round(q.weighted_score * 10) / 10}/{Math.round(q.weighted_max_score * 10) / 10}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-slate-500">النسبة:</span>
                      <span className="font-semibold text-slate-800 mr-1">{q.percentage}%</span>
                    </div>
                    <div className={`p-2 rounded border ${q.is_correct ? 'bg-success-50 border-success-200' : q.is_correct === false ? 'bg-danger-50 border-danger-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className={q.is_correct ? 'text-success-700 font-semibold' : q.is_correct === false ? 'text-danger-700 font-semibold' : 'text-slate-500'}>
                        {q.is_correct ? '✓ صحيح' : q.is_correct === false ? '✗ خطأ' : 'غير محدد'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex justify-center"
      >
        <Link
          to="/my-results"
          className="btn btn-primary px-8"
        >
          عرض جميع نتائجي
        </Link>
      </motion.div>
    </div>
  );
}

