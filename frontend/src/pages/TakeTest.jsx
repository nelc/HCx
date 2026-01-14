import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClockIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

// Question components
function MCQQuestion({ question, value, onChange }) {
  const options = question.options || [];
  
  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`w-full p-4 rounded-xl border-2 text-right transition-all ${
            value === option.value
              ? 'border-primary-500 bg-primary-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
              value === option.value
                ? 'border-primary-500 bg-primary-500'
                : 'border-slate-300'
            }`}>
              {value === option.value && <CheckIcon className="w-4 h-4 text-white" />}
            </div>
            <span className={value === option.value ? 'text-primary-700 font-medium' : 'text-slate-700'}>
              {option.text_ar}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function LikertQuestion({ question, value, onChange }) {
  const labels = question.likert_labels || { scale: 5 };
  const scale = labels.scale || 5;
  const options = Array.from({ length: scale }, (_, i) => i + 1);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm text-slate-500">
        <span>{labels.min_label_ar || 'لا أوافق'}</span>
        <span>{labels.max_label_ar || 'أوافق'}</span>
      </div>
      <div className="flex justify-between gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(String(opt))}
            className={`flex-1 py-4 rounded-xl border-2 transition-all font-semibold ${
              value === String(opt)
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelfRatingQuestion({ question, value, onChange }) {
  const config = question.self_rating_config || { min: 1, max: 10 };
  const min = config.min || 1;
  const max = config.max || 10;
  const options = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const labels = config.labels || [];
  
  return (
    <div className="space-y-4">
      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex justify-between text-sm text-slate-500">
          {labels.map((label, i) => (
            <span key={i} style={{ position: 'relative', left: `${((label.value - min) / (max - min)) * 100 - 50}%` }}>
              {label.ar}
            </span>
          ))}
        </div>
      )}
      
      {/* Scale */}
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(String(opt))}
            className={`flex-1 py-3 rounded-lg border transition-all text-sm font-medium ${
              value === String(opt)
                ? 'border-primary-500 bg-primary-500 text-white'
                : parseInt(value) >= opt
                  ? 'border-primary-300 bg-primary-100 text-primary-700'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function OpenTextQuestion({ question, value, onChange }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={6}
      className="input resize-none"
      placeholder="اكتب إجابتك هنا..."
    />
  );
}

export default function TakeTest() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [assignment, setAssignment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  // Timer
  useEffect(() => {
    if (!assignment?.is_timed || !assignment?.duration_minutes || !startTime) return;
    
    const endTime = new Date(startTime.getTime() + assignment.duration_minutes * 60 * 1000);
    
    const interval = setInterval(() => {
      const now = new Date();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        handleSubmit();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [assignment, startTime]);

  const fetchAssignment = async (retryCount = 0) => {
    const maxRetries = 2;
    const retryDelay = 1000; // 1 second
    let shouldNavigateAway = false;
    
    try {
      const response = await api.get(`/assignments/${id}`);
      setAssignment(response.data);
      
      // Start test if pending
      if (response.data.status === 'pending') {
        await api.post(`/assignments/${id}/start`);
      }
      
      setStartTime(new Date());
      
      // Fetch questions
      const questionsRes = await api.get(`/questions/test/${response.data.test_id}`);
      const fetchedQuestions = questionsRes.data || [];
      
      if (fetchedQuestions.length === 0) {
        toast.error('هذا التقييم لا يحتوي على أسئلة');
        setLoading(false);
        setTimeout(() => navigate('/assessments'), 100);
        return;
      }
      
      setQuestions(fetchedQuestions);
      
      // Fetch existing responses
      const responsesRes = await api.get(`/responses/assignment/${id}`);
      const existingResponses = {};
      (responsesRes.data || []).forEach(r => {
        existingResponses[r.question_id] = r.response_value;
      });
      setResponses(existingResponses);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch assignment:', error);
      
      // Retry on network errors (when backend might be starting up)
      const isNetworkError = error.message === 'Network Error' || 
                            error.code === 'ECONNREFUSED' || 
                            error.code === 'ERR_NETWORK' ||
                            !error.response;
      
      if (isNetworkError && retryCount < maxRetries) {
        console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return fetchAssignment(retryCount + 1);
      }
      
      // Show error only if all retries failed
      const errorMessage = error.response?.status === 404 
        ? 'التقييم غير موجود' 
        : error.response?.status === 403
        ? 'ليس لديك صلاحية للوصول إلى هذا التقييم'
        : isNetworkError
        ? 'فشل الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت أو المحاولة مرة أخرى'
        : 'فشل في تحميل التقييم';
      
      setHasError(true);
      setLoading(false);
      toast.error(errorMessage);
      
      // Navigate away after showing error
      setTimeout(() => {
        navigate('/assessments');
      }, 1500);
    }
  };

  const saveResponse = useCallback(async (questionId, value) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
    
    try {
      await api.post('/responses', {
        assignment_id: id,
        question_id: questionId,
        response_value: value
      });
    } catch (error) {
      console.error('Failed to save response');
    }
  }, [id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    
    try {
      const timeSpent = startTime ? Math.floor((new Date() - startTime) / 1000) : 0;
      
      const response = await api.post(`/responses/submit/${id}`, {
        time_spent_seconds: timeSpent
      });
      
      toast.success('تم إرسال التقييم بنجاح!', { duration: 2000 });
      
      // Navigate to immediate results page with weighted breakdown
      setTimeout(() => {
        navigate(`/test-results/${id}`);
      }, 1000);
    } catch (error) {
      toast.error('فشل في إرسال التقييم');
      setSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(responses).length;

  if (loading || hasError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          {!hasError ? (
            <>
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600">جاري تحميل التقييم...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-danger-600" />
              </div>
              <p className="text-slate-600">جاري إعادة التوجيه...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-800">{assignment?.test_title_ar}</h1>
            <p className="text-sm text-slate-500">{assignment?.domain_name_ar}</p>
          </div>
          
          {assignment?.is_timed && timeRemaining !== null && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              timeRemaining < 300 ? 'bg-danger-50 text-danger-600' : 'bg-slate-100 text-slate-600'
            }`}>
              <ClockIcon className="w-5 h-5" />
              <span className="font-mono font-semibold">{formatTime(timeRemaining)}</span>
            </div>
          )}
        </div>
        
        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-slate-500 mb-2">
            <span>السؤال {currentIndex + 1} من {questions.length}</span>
            <span>{answeredCount} إجابات</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="card p-6 mb-6"
        >
          <div className="mb-6">
            <span className="badge badge-primary mb-3">
              {currentQuestion?.skill_name_ar || 'مهارة عامة'}
            </span>
            <h2 className="text-xl font-semibold text-slate-800">
              {currentQuestion?.question_ar}
            </h2>
          </div>

          {currentQuestion?.question_type === 'mcq' && (
            <MCQQuestion
              question={currentQuestion}
              value={responses[currentQuestion.id]}
              onChange={(v) => saveResponse(currentQuestion.id, v)}
            />
          )}
          
          {currentQuestion?.question_type === 'likert_scale' && (
            <LikertQuestion
              question={currentQuestion}
              value={responses[currentQuestion.id]}
              onChange={(v) => saveResponse(currentQuestion.id, v)}
            />
          )}
          
          {currentQuestion?.question_type === 'self_rating' && (
            <SelfRatingQuestion
              question={currentQuestion}
              value={responses[currentQuestion.id]}
              onChange={(v) => saveResponse(currentQuestion.id, v)}
            />
          )}
          
          {currentQuestion?.question_type === 'open_text' && (
            <OpenTextQuestion
              question={currentQuestion}
              value={responses[currentQuestion.id]}
              onChange={(v) => saveResponse(currentQuestion.id, v)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="btn btn-secondary disabled:opacity-50"
        >
          <ChevronRightIcon className="w-5 h-5" />
          السابق
        </button>

        {/* Question dots */}
        <div className="hidden sm:flex items-center gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentIndex(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                i === currentIndex 
                  ? 'bg-primary-500 scale-125' 
                  : responses[q.id] 
                    ? 'bg-success-500' 
                    : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {currentIndex === questions.length - 1 ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="btn btn-primary"
          >
            إنهاء التقييم
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
            className="btn btn-primary"
          >
            التالي
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ExclamationTriangleIcon className="w-8 h-8 text-warning-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">تأكيد الإرسال</h3>
                <p className="text-slate-500 mb-4">
                  أجبت على {answeredCount} من {questions.length} سؤال.
                  {answeredCount < questions.length && (
                    <span className="text-warning-600 block mt-1">
                      لم تكمل جميع الأسئلة!
                    </span>
                  )}
                </p>
                <p className="text-slate-500 mb-6">
                  هل أنت متأكد من إرسال إجاباتك؟
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="btn btn-secondary flex-1"
                    disabled={submitting}
                  >
                    العودة للمراجعة
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="btn btn-primary flex-1"
                    disabled={submitting}
                  >
                    {submitting ? 'جاري الإرسال...' : 'تأكيد الإرسال'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

