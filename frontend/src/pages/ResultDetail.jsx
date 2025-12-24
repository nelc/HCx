import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  ExclamationCircleIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ScaleIcon,
  LightBulbIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import { formatDate } from '../utils/helpers';
import WeightedScoreBreakdown from '../components/WeightedScoreBreakdown';
import useAuthStore from '../store/authStore';

export default function ResultDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignment_id');
  const { user } = useAuthStore();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState([]);
  const [gradingScores, setGradingScores] = useState({});
  const [savingGrade, setSavingGrade] = useState({});
  const [recalculating, setRecalculating] = useState(false);
  const [gradingComplete, setGradingComplete] = useState(false);

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

      // Fetch responses for viewing answers (for all users)
      const actualAssignmentId = assignmentId || response.data.assignment_id;
      if (actualAssignmentId) {
        const responsesRes = await api.get(`/responses/assignment/${actualAssignmentId}`);
        setResponses(responsesRes.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch result');
    } finally {
      setLoading(false);
    }
  };

  // Handle admin grading for open_text questions
  const handleGradeOpenText = async (responseId, percentage) => {
    try {
      setSavingGrade(prev => ({ ...prev, [responseId]: true }));
      const score = (parseFloat(percentage) / 100) * 10; // Convert percentage to 0-10 scale
      const gradeResponse = await api.patch(`/responses/${responseId}/grade`, { score, percentage: parseFloat(percentage) });
      
      // Refresh responses
      const actualAssignmentId = assignmentId || result.assignment_id;
      if (actualAssignmentId) {
        const responsesRes = await api.get(`/responses/assignment/${actualAssignmentId}`);
        setResponses(responsesRes.data || []);
      }
      
      setGradingScores(prev => ({ ...prev, [responseId]: undefined }));
      
      // If all questions are now graded, refresh the entire result to get the new final score
      if (gradeResponse.data.all_graded) {
        setGradingComplete(true);
        await fetchResult();
        // Auto-hide the success message after 5 seconds
        setTimeout(() => setGradingComplete(false), 5000);
      }
    } catch (error) {
      console.error('Failed to save grade:', error);
    } finally {
      setSavingGrade(prev => ({ ...prev, [responseId]: false }));
    }
  };

  // Recalculate total grade after grading open questions
  const handleRecalculateGrade = async () => {
    try {
      setRecalculating(true);
      const actualAssignmentId = assignmentId || result.assignment_id;
      
      await api.post(`/results-overview/recalculate/${actualAssignmentId}`);
      
      // Refresh the result
      await fetchResult();
    } catch (error) {
      console.error('Failed to recalculate grade:', error);
    } finally {
      setRecalculating(false);
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
        <Link to="/results-overview" className="btn btn-primary inline-flex">
          العودة إلى النتائج
        </Link>
      </div>
    );
  }

  const weightedBreakdown = result.weighted_breakdown || [];
  const weightedTotals = result.weighted_totals || null;
  
  // Use weighted percentage as the actual score
  const actualScore = weightedTotals?.weighted_percentage || result.overall_score || 0;

  // Check if there are ungraded open_text questions (score === null means not graded, score === 0 is a valid grade)
  const ungradedOpenQuestions = responses.filter(
    r => r.question_type === 'open_text' && r.score === null
  );
  const hasUngradedQuestions = ungradedOpenQuestions.length > 0;
  const isAdmin = user?.role === 'admin' || user?.role === 'training_officer';

  const getScoreColor = (percentage) => {
    if (percentage >= 70) return 'text-success-600 bg-success-50';
    if (percentage >= 40) return 'text-warning-600 bg-warning-50';
    return 'text-danger-600 bg-danger-50';
  };

  const getQuestionTypeLabel = (type) => {
    const labels = {
      'mcq': 'اختيار من متعدد',
      'likert_scale': 'مقياس ليكرت',
      'self_rating': 'تقييم ذاتي',
      'open_text': 'نص مفتوح'
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Link to="/results-overview" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowRightIcon className="w-5 h-5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-primary-700">{result.test_title_ar}</h1>
          <p className="text-slate-500">{result.domain_name_ar} • {formatDate(result.analyzed_at)}</p>
          {result.user_name_ar && (
            <p className="text-sm text-slate-600 mt-1">الموظف: {result.user_name_ar}</p>
          )}
        </div>
      </div>

      {/* Grading Complete Success Alert */}
      {gradingComplete && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="card p-4 bg-success-50 border-success-200"
        >
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-success-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-success-800">تم إكمال التقييم بنجاح!</h3>
              <p className="text-sm text-success-700">
                تم تقييم جميع الأسئلة المفتوحة وحساب الدرجة النهائية.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Needs Grading Alert */}
      {isAdmin && hasUngradedQuestions && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 bg-amber-50 border-amber-200"
        >
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">يحتاج تقييم</h3>
              <p className="text-sm text-amber-700">
                يوجد {ungradedOpenQuestions.length} سؤال مفتوح يحتاج إلى تقييم. الدرجة الحالية غير نهائية.
              </p>
            </div>
            <button
              onClick={handleRecalculateGrade}
              disabled={recalculating}
              className="btn bg-amber-600 text-white hover:bg-amber-700 text-sm"
            >
              {recalculating ? 'جاري الحساب...' : 'إعادة حساب الدرجة'}
            </button>
          </div>
        </motion.div>
      )}

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
          {hasUngradedQuestions && isAdmin ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm mb-3">
              <ExclamationTriangleIcon className="w-4 h-4" />
              غير نهائية - تحتاج تقييم
            </span>
          ) : isAdmin && responses.some(r => r.question_type === 'open_text') ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-success-100 text-success-700 rounded-full text-sm mb-3">
              <CheckCircleIcon className="w-4 h-4" />
              الدرجة النهائية
            </span>
          ) : null}
          <p className="text-slate-500 max-w-md mx-auto">
            {actualScore >= 70 
              ? 'أداء ممتاز! أنت تمتلك مهارات قوية في هذا المجال'
              : actualScore >= 40
                ? 'أداء جيد مع وجود فرص للتحسين'
                : 'هناك حاجة لتطوير المهارات في هذا المجال'}
          </p>
        </div>
      </motion.div>

      {/* Responses Detail Section */}
      {responses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ScaleIcon className="w-6 h-6 text-primary-600" />
              <h3 className="text-lg font-semibold text-primary-700">
                {isAdmin ? 'تفصيل الإجابات والتقييم' : 'تفصيل إجاباتك'}
              </h3>
            </div>
            {isAdmin && hasUngradedQuestions && (
              <span className="text-sm text-amber-600">
                {ungradedOpenQuestions.length} سؤال يحتاج تقييم
              </span>
            )}
          </div>

          <div className="space-y-4">
            {responses.map((response, index) => {
              const weight = parseFloat(response.weight) || 1;
              let maxScore = 10;

              if (response.question_type === 'mcq' && response.options && Array.isArray(response.options)) {
                const optionScores = response.options.map(o => parseFloat(o.score) || 0);
                maxScore = Math.max(...optionScores, 10);
              }

              const rawScore = parseFloat(response.score) || 0;
              const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
              const isOpenText = response.question_type === 'open_text';
              const needsGrading = isOpenText && response.score === null; // score === 0 is a valid grade

              return (
                <div
                  key={response.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isAdmin && needsGrading 
                      ? 'bg-amber-50 border-amber-200' 
                      : 'bg-slate-50 border-slate-100 hover:border-primary-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Question Number */}
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isAdmin && needsGrading ? 'bg-amber-200' : 'bg-primary-100'
                      }`}>
                        <span className={`text-sm font-semibold ${
                          isAdmin && needsGrading ? 'text-amber-700' : 'text-primary-700'
                        }`}>{index + 1}</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Question Text */}
                      <p className="text-sm text-slate-700 mb-2">{response.question_ar}</p>
                      
                      {/* Question Type & Skill */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          isOpenText ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {getQuestionTypeLabel(response.question_type)}
                        </span>
                        {response.skill_name_ar && (
                          <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded">
                            {response.skill_name_ar}
                          </span>
                        )}
                        {isAdmin && needsGrading && (
                          <span className="text-xs px-2 py-1 bg-amber-200 text-amber-800 rounded font-medium">
                            يحتاج تقييم
                          </span>
                        )}
                      </div>

                      {/* Show MCQ answer options with employee's selection */}
                      {response.question_type === 'mcq' && response.options && Array.isArray(response.options) && (
                        <div className="mb-3 p-3 bg-slate-100 rounded-lg border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-semibold text-slate-700">
                              {isAdmin ? 'إجابة الموظف:' : 'الإجابة التي اخترتها:'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {response.options.map((option, optIndex) => {
                              const isSelected = response.response_value === option.value;
                              const isCorrect = option.is_correct;
                              const selectedAndCorrect = isSelected && isCorrect;
                              const selectedAndWrong = isSelected && !isCorrect;
                              
                              return (
                                <div
                                  key={option.value || optIndex}
                                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                                    selectedAndCorrect
                                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                                      : selectedAndWrong
                                        ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
                                        : isCorrect
                                          ? 'bg-emerald-50/50 border-emerald-200'
                                          : 'bg-white border-slate-200'
                                  }`}
                                >
                                  {/* Option Letter */}
                                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                    selectedAndCorrect
                                      ? 'bg-emerald-500 text-white'
                                      : selectedAndWrong
                                        ? 'bg-red-500 text-white'
                                        : isCorrect
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][optIndex] || (optIndex + 1)}
                                  </span>
                                  
                                  {/* Option Text */}
                                  <span className={`flex-1 text-sm ${
                                    isSelected ? 'font-medium' : ''
                                  } ${
                                    selectedAndCorrect
                                      ? 'text-emerald-800'
                                      : selectedAndWrong
                                        ? 'text-red-800'
                                        : 'text-slate-700'
                                  }`}>
                                    {option.text_ar || option.text || ''}
                                  </span>
                                  
                                  {/* Indicators */}
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {isSelected && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                        isCorrect
                                          ? 'bg-emerald-200 text-emerald-800'
                                          : 'bg-red-200 text-red-800'
                                      }`}>
                                        {isAdmin ? 'اختيار الموظف' : 'اختيارك'}
                                      </span>
                                    )}
                                    {isCorrect && (
                                      <span className="flex items-center gap-1 text-xs text-emerald-700">
                                        <CheckCircleIcon className="w-4 h-4" />
                                        <span className="font-medium">صحيح</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Show employee's answer for open_text questions */}
                      {isOpenText && response.response_value && (
                        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <div className="flex items-center gap-2 mb-2">
                            <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-medium text-blue-700">
                              {isAdmin ? 'إجابة الموظف:' : 'إجابتك:'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{response.response_value}</p>
                        </div>
                      )}

                      {/* Admin grading for open_text questions */}
                      {isAdmin && isOpenText && (
                        <div className="mb-3 p-3 bg-white rounded-lg border border-slate-200">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm font-medium text-slate-700">تقييم المدير:</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                placeholder={response.score !== null ? percentage.toString() : "0-100"}
                                value={gradingScores[response.id] ?? (response.score !== null ? percentage : '')}
                                onChange={(e) => setGradingScores(prev => ({ ...prev, [response.id]: e.target.value }))}
                                className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              />
                              <span className="text-sm text-slate-600">%</span>
                              <button
                                onClick={() => handleGradeOpenText(response.id, gradingScores[response.id] ?? percentage)}
                                disabled={savingGrade[response.id] || (gradingScores[response.id] === undefined && response.score === null)}
                                className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {savingGrade[response.id] ? 'جاري الحفظ...' : 'حفظ التقييم'}
                              </button>
                            </div>
                            {response.score !== null && (
                              <span className="flex items-center gap-1 text-sm text-success-600">
                                <CheckCircleIcon className="w-4 h-4" />
                                تم التقييم
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Score Grid - Admin only */}
                      {isAdmin && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="p-2 bg-white rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 mb-1">الوزن</p>
                            <p className="text-sm font-semibold text-slate-800">×{weight}</p>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 mb-1">النقاط الخام</p>
                            <p className="text-sm font-semibold text-slate-800">
                              {rawScore.toFixed(1)} / {maxScore}
                            </p>
                          </div>
                          <div className="p-2 bg-accent-50 rounded-lg border border-accent-200">
                            <p className="text-xs text-accent-600 mb-1">النقاط المرجحة</p>
                            <p className="text-sm font-bold text-accent-700">
                              {(rawScore * weight).toFixed(1)} / {(maxScore * weight).toFixed(1)}
                            </p>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 mb-1">النسبة</p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getScoreColor(percentage)}`}>
                              {percentage}%
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Progress Bar - Admin only */}
                      {isAdmin && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                percentage >= 70 ? 'bg-success-500' :
                                percentage >= 40 ? 'bg-warning-500' : 'bg-danger-500'
                              }`}
                              style={{ width: `${Math.min(100, percentage)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Rationale and Common Errors - MCQ Questions Only */}
                      {response.question_type === 'mcq' && response.assessment_metadata && (
                        <div className="mt-4 space-y-3">
                          {/* Rationale */}
                          {response.assessment_metadata.rationale && (
                            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                              <div className="flex items-center gap-2 mb-2">
                                <LightBulbIcon className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-700">تبرير الإجابة الصحيحة:</span>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{response.assessment_metadata.rationale}</p>
                            </div>
                          )}

                          {/* Common Errors */}
                          {response.assessment_metadata.common_errors && (
                            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <div className="flex items-center gap-2 mb-2">
                                <InformationCircleIcon className="w-4 h-4 text-amber-600" />
                                <span className="text-sm font-semibold text-amber-700">الأخطاء الشائعة:</span>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{response.assessment_metadata.common_errors}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recalculate Button at Bottom OR Grading Complete Message - Admin only */}
          {isAdmin && hasUngradedQuestions ? (
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-center">
              <button
                onClick={handleRecalculateGrade}
                disabled={recalculating}
                className="btn btn-primary px-6"
              >
                {recalculating ? 'جاري إعادة الحساب...' : 'إعادة حساب الدرجة النهائية'}
              </button>
            </div>
          ) : isAdmin && responses.some(r => r.question_type === 'open_text') && (
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-center">
              <div className="flex items-center gap-2 text-success-600 bg-success-50 px-4 py-2 rounded-lg">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="font-medium">تم إكمال تقييم جميع الأسئلة المفتوحة - الدرجة نهائية</span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Weighted Score Breakdown (only for admin when no responses loaded) */}
      {isAdmin && responses.length === 0 && weightedBreakdown.length > 0 && (
        <WeightedScoreBreakdown breakdown={weightedBreakdown} totals={weightedTotals} />
      )}

    </div>
  );
}
