import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, Reorder } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  ChevronDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Disclosure } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const questionTypes = [
  { value: 'mcq', label: 'اختيار من متعدد', icon: '🔘' },
  { value: 'likert_scale', label: 'مقياس ليكرت', icon: '📊' },
  { value: 'self_rating', label: 'تقييم ذاتي', icon: '⭐' },
  { value: 'open_text', label: 'نص مفتوح', icon: '📝' },
];

export default function TestBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState([]);
  const [skills, setSkills] = useState([]);
  
  const [test, setTest] = useState({
    domain_id: '',
    title_ar: '',
    title_en: '',
    description_ar: '',
    description_en: '',
    instructions_ar: '',
    instructions_en: '',
    duration_minutes: 30,
    is_timed: false,
    is_randomized: false,
    show_results_immediately: true,
    confidentiality_level: 'standard',
  });
  
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    fetchDomains();
    if (isEditing) {
      fetchTest();
    }
  }, [id]);

  useEffect(() => {
    if (test.domain_id) {
      fetchSkills(test.domain_id);
    }
  }, [test.domain_id]);

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains');
      setDomains(response.data || []);
    } catch (error) {
      console.error('Failed to fetch domains');
    }
  };

  const fetchSkills = async (domainId) => {
    try {
      const response = await api.get(`/skills?domain_id=${domainId}`);
      setSkills(response.data || []);
    } catch (error) {
      console.error('Failed to fetch skills');
    }
  };

  const fetchTest = async () => {
    try {
      const response = await api.get(`/tests/${id}`);
      const testData = response.data;
      setTest({
        domain_id: testData.domain_id,
        title_ar: testData.title_ar,
        title_en: testData.title_en,
        description_ar: testData.description_ar || '',
        description_en: testData.description_en || '',
        instructions_ar: testData.instructions_ar || '',
        instructions_en: testData.instructions_en || '',
        duration_minutes: testData.duration_minutes || 30,
        is_timed: testData.is_timed,
        is_randomized: testData.is_randomized,
        show_results_immediately: testData.show_results_immediately,
        confidentiality_level: testData.confidentiality_level,
      });
      setQuestions(testData.questions || []);
    } catch (error) {
      toast.error('فشل في تحميل التقييم');
      navigate('/tests');
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = (type) => {
    const newQuestion = {
      id: `new-${Date.now()}`,
      question_type: type,
      question_ar: '',
      question_en: '',
      skill_id: '',
      required: true,
      weight: 1.0,
      options: type === 'mcq' ? [
        { value: 'a', text_ar: '', text_en: '', is_correct: false, score: 0 },
        { value: 'b', text_ar: '', text_en: '', is_correct: false, score: 0 },
      ] : null,
      likert_labels: type === 'likert_scale' ? {
        min_label_ar: 'لا أوافق بشدة',
        min_label_en: 'Strongly Disagree',
        max_label_ar: 'أوافق بشدة',
        max_label_en: 'Strongly Agree',
        scale: 5
      } : null,
      self_rating_config: type === 'self_rating' ? {
        min: 1, max: 10,
        labels: [
          { value: 1, ar: 'مبتدئ', en: 'Beginner' },
          { value: 5, ar: 'متوسط', en: 'Intermediate' },
          { value: 10, ar: 'خبير', en: 'Expert' }
        ]
      } : null,
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (index, updates) => {
    const newQuestions = [...questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setQuestions(newQuestions);
  };

  const removeQuestion = (index) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return;
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const addOption = (questionIndex) => {
    const question = questions[questionIndex];
    const options = question.options || [];
    const newValue = String.fromCharCode(97 + options.length);
    const newOptions = [...options, { value: newValue, text_ar: '', text_en: '', is_correct: false, score: 0 }];
    updateQuestion(questionIndex, { options: newOptions });
  };

  const updateOption = (questionIndex, optionIndex, updates) => {
    const question = questions[questionIndex];
    const options = [...(question.options || [])];
    options[optionIndex] = { ...options[optionIndex], ...updates };
    updateQuestion(questionIndex, { options });
  };

  const removeOption = (questionIndex, optionIndex) => {
    const question = questions[questionIndex];
    const options = (question.options || []).filter((_, i) => i !== optionIndex);
    updateQuestion(questionIndex, { options });
  };

  const handleSave = async () => {
    // Validation
    if (!test.domain_id) {
      toast.error('الرجاء اختيار مجال التدريب');
      return;
    }
    if (!test.title_ar) {
      toast.error('الرجاء إدخال عنوان التقييم');
      return;
    }
    if (questions.length === 0) {
      toast.error('الرجاء إضافة سؤال واحد على الأقل');
      return;
    }
    
    // Check questions have content
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].question_ar) {
        toast.error(`الرجاء إدخال نص السؤال رقم ${i + 1}`);
        return;
      }
    }
    
    setSaving(true);
    
    try {
      let testId = id;
      
      if (isEditing) {
        await api.put(`/tests/${id}`, test);
      } else {
        const response = await api.post('/tests', test);
        testId = response.data.id;
      }
      
      // Save questions
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const questionData = {
          test_id: testId,
          skill_id: q.skill_id || null,
          question_type: q.question_type,
          question_ar: q.question_ar,
          question_en: q.question_en || q.question_ar,
          options: q.options,
          likert_labels: q.likert_labels,
          self_rating_config: q.self_rating_config,
          required: q.required,
          weight: q.weight,
          order_index: i + 1,
        };
        
        if (q.id && !q.id.startsWith('new-')) {
          await api.put(`/questions/${q.id}`, questionData);
        } else {
          await api.post('/questions', questionData);
        }
      }
      
      toast.success('تم حفظ التقييم بنجاح');
      navigate(`/tests/${testId}`);
    } catch (error) {
      toast.error('فشل في حفظ التقييم');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">
            {isEditing ? 'تعديل التقييم' : 'إنشاء تقييم جديد'}
          </h1>
          <p className="text-slate-500">قم ببناء استبيان أو اختبار مخصص</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ التقييم'}
        </button>
      </div>

      {/* Test Details */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-primary-700 mb-4">معلومات التقييم</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">مجال التدريب *</label>
            <select
              value={test.domain_id}
              onChange={(e) => setTest({ ...test, domain_id: e.target.value })}
              className="input"
            >
              <option value="">اختر المجال</option>
              {domains.map(domain => (
                <option key={domain.id} value={domain.id}>{domain.name_ar}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="label">العنوان بالعربية *</label>
            <input
              type="text"
              value={test.title_ar}
              onChange={(e) => setTest({ ...test, title_ar: e.target.value })}
              className="input"
              placeholder="عنوان التقييم"
            />
          </div>
          
          <div>
            <label className="label">العنوان بالإنجليزية</label>
            <input
              type="text"
              value={test.title_en}
              onChange={(e) => setTest({ ...test, title_en: e.target.value })}
              className="input"
              placeholder="Test Title"
              dir="ltr"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="label">الوصف بالعربية</label>
            <textarea
              value={test.description_ar}
              onChange={(e) => setTest({ ...test, description_ar: e.target.value })}
              className="input resize-none"
              rows={3}
              placeholder="وصف مختصر للتقييم"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="label">تعليمات التقييم</label>
            <textarea
              value={test.instructions_ar}
              onChange={(e) => setTest({ ...test, instructions_ar: e.target.value })}
              className="input resize-none"
              rows={3}
              placeholder="تعليمات للموظفين قبل بدء التقييم"
            />
          </div>
          
          <div>
            <label className="label">المدة (دقيقة)</label>
            <input
              type="number"
              value={test.duration_minutes}
              onChange={(e) => setTest({ ...test, duration_minutes: parseInt(e.target.value) || 30 })}
              className="input"
              min={5}
              max={180}
            />
          </div>
          
          <div>
            <label className="label">مستوى السرية</label>
            <select
              value={test.confidentiality_level}
              onChange={(e) => setTest({ ...test, confidentiality_level: e.target.value })}
              className="input"
            >
              <option value="public">عام</option>
              <option value="standard">عادي</option>
              <option value="confidential">سري</option>
              <option value="highly_confidential">سري للغاية</option>
            </select>
          </div>
          
          <div className="md:col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={test.is_timed}
                onChange={(e) => setTest({ ...test, is_timed: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">تفعيل المؤقت</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={test.is_randomized}
                onChange={(e) => setTest({ ...test, is_randomized: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">ترتيب عشوائي للأسئلة</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={test.show_results_immediately}
                onChange={(e) => setTest({ ...test, show_results_immediately: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">إظهار النتائج فوراً</span>
            </label>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary-700">الأسئلة ({questions.length})</h2>
        </div>
        
        {/* Add question buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {questionTypes.map(type => (
            <button
              key={type.value}
              onClick={() => addQuestion(type.value)}
              className="btn btn-secondary text-sm"
            >
              <span>{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>

        {/* Questions list */}
        <div className="space-y-4">
          {questions.map((question, index) => (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-slate-200 rounded-xl overflow-hidden"
            >
              <Disclosure defaultOpen>
                {({ open }) => (
                  <>
                    <Disclosure.Button className="w-full p-4 bg-slate-50 flex items-center justify-between text-right">
                      <div className="flex items-center gap-3">
                        <Bars3Icon className="w-5 h-5 text-slate-400" />
                        <span className="font-medium text-slate-700">
                          {index + 1}. {question.question_ar || 'سؤال جديد'}
                        </span>
                        <span className="badge badge-primary text-xs">
                          {questionTypes.find(t => t.value === question.question_type)?.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeQuestion(index); }}
                          className="p-1 text-slate-400 hover:text-danger-500"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                        <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </div>
                    </Disclosure.Button>
                    
                    <Disclosure.Panel className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="label">نص السؤال بالعربية *</label>
                          <textarea
                            value={question.question_ar}
                            onChange={(e) => updateQuestion(index, { question_ar: e.target.value })}
                            className="input resize-none"
                            rows={2}
                            placeholder="اكتب السؤال هنا"
                          />
                        </div>
                        
                        <div>
                          <label className="label">المهارة المرتبطة</label>
                          <select
                            value={question.skill_id || ''}
                            onChange={(e) => updateQuestion(index, { skill_id: e.target.value || null })}
                            className="input"
                          >
                            <option value="">بدون تحديد</option>
                            {skills.map(skill => (
                              <option key={skill.id} value={skill.id}>{skill.name_ar}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="label">الوزن</label>
                          <input
                            type="number"
                            value={question.weight}
                            onChange={(e) => updateQuestion(index, { weight: parseFloat(e.target.value) || 1 })}
                            className="input"
                            min={0.1}
                            max={10}
                            step={0.1}
                          />
                        </div>
                      </div>
                      
                      {/* MCQ Options */}
                      {question.question_type === 'mcq' && (
                        <div>
                          <label className="label">الخيارات</label>
                          <div className="space-y-2">
                            {(question.options || []).map((option, optIndex) => (
                              <div key={option.value} className="flex items-center gap-2">
                                <span className="text-slate-500 w-6">{option.value})</span>
                                <input
                                  type="text"
                                  value={option.text_ar}
                                  onChange={(e) => updateOption(index, optIndex, { text_ar: e.target.value })}
                                  className="input flex-1"
                                  placeholder="نص الخيار"
                                />
                                <input
                                  type="number"
                                  value={option.score}
                                  onChange={(e) => updateOption(index, optIndex, { score: parseInt(e.target.value) || 0 })}
                                  className="input w-20"
                                  placeholder="الدرجة"
                                />
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={option.is_correct}
                                    onChange={(e) => updateOption(index, optIndex, { is_correct: e.target.checked })}
                                    className="w-4 h-4 rounded border-slate-300 text-success-600"
                                  />
                                  <span className="text-xs text-slate-500">صحيح</span>
                                </label>
                                <button
                                  onClick={() => removeOption(index, optIndex)}
                                  className="p-1 text-slate-400 hover:text-danger-500"
                                >
                                  <XMarkIcon className="w-5 h-5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => addOption(index)}
                            className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                          >
                            + إضافة خيار
                          </button>
                        </div>
                      )}
                      
                      {/* Likert Scale Settings */}
                      {question.question_type === 'likert_scale' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="label">التسمية الدنيا</label>
                            <input
                              type="text"
                              value={question.likert_labels?.min_label_ar || ''}
                              onChange={(e) => updateQuestion(index, { 
                                likert_labels: { ...question.likert_labels, min_label_ar: e.target.value }
                              })}
                              className="input"
                              placeholder="لا أوافق بشدة"
                            />
                          </div>
                          <div>
                            <label className="label">التسمية العليا</label>
                            <input
                              type="text"
                              value={question.likert_labels?.max_label_ar || ''}
                              onChange={(e) => updateQuestion(index, { 
                                likert_labels: { ...question.likert_labels, max_label_ar: e.target.value }
                              })}
                              className="input"
                              placeholder="أوافق بشدة"
                            />
                          </div>
                          <div>
                            <label className="label">عدد المستويات</label>
                            <select
                              value={question.likert_labels?.scale || 5}
                              onChange={(e) => updateQuestion(index, { 
                                likert_labels: { ...question.likert_labels, scale: parseInt(e.target.value) }
                              })}
                              className="input"
                            >
                              <option value={5}>5 مستويات</option>
                              <option value={7}>7 مستويات</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
            </motion.div>
          ))}
        </div>
        
        {questions.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <p>لم تتم إضافة أي أسئلة بعد</p>
            <p className="text-sm">اضغط على أحد أنواع الأسئلة أعلاه لإضافة سؤال</p>
          </div>
        )}
      </div>
    </div>
  );
}

