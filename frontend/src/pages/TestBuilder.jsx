import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  ChevronDownIcon,
  XMarkIcon,
  SparklesIcon,
  PencilSquareIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { Disclosure, Tab } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

const questionTypes = [
  { value: 'mcq', label: 'اختيار من متعدد', icon: '🔘' },
  { value: 'likert_scale', label: 'مقياس ليكرت', icon: '📊' },
  { value: 'self_rating', label: 'تقييم ذاتي', icon: '⭐' },
  { value: 'open_text', label: 'نص مفتوح', icon: '📝' },
];

const difficultyLevels = [
  { value: 'beginner', label: 'مبتدئ', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'intermediate', label: 'متوسط', color: 'bg-amber-100 text-amber-700' },
  { value: 'advanced', label: 'متقدم', color: 'bg-rose-100 text-rose-700' },
  { value: 'mix', label: 'مزيج', color: 'bg-violet-100 text-violet-700' },
];

export default function TestBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState([]);
  const [skills, setSkills] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  
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
  
  // AI Generation state
  const [aiConfig, setAiConfig] = useState({
    numberOfQuestions: 5,
    questionTypes: [],
    level: 'intermediate',
  });
  const [generatingAI, setGeneratingAI] = useState(false);
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState(null);

  useEffect(() => {
    fetchDomains();
    if (isEditing) {
      fetchTest();
    }
  }, [id]);

  useEffect(() => {
    if (test.domain_id) {
      fetchSkills(test.domain_id);
    } else {
      setSkills([]);
      setSelectedSkills([]);
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
      // Load selected skills if they exist
      if (testData.target_skills) {
        setSelectedSkills(testData.target_skills.map(s => s.id));
      }
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
    setQuestionToDelete(index);
    setShowDeleteConfirm(true);
  };
  
  const confirmDeleteQuestion = () => {
    if (questionToDelete !== null) {
      setQuestions(questions.filter((_, i) => i !== questionToDelete));
      toast.success('تم حذف السؤال بنجاح');
    }
    setShowDeleteConfirm(false);
    setQuestionToDelete(null);
  };
  
  const cancelDeleteQuestion = () => {
    setShowDeleteConfirm(false);
    setQuestionToDelete(null);
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

  const toggleAiQuestionType = (type) => {
    setAiConfig(prev => ({
      ...prev,
      questionTypes: prev.questionTypes.includes(type)
        ? prev.questionTypes.filter(t => t !== type)
        : [...prev.questionTypes, type]
    }));
  };

  const toggleSkill = (skillId) => {
    setSelectedSkills(prev => 
      prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  const handleGenerateAI = async () => {
    // Validation
    if (!test.domain_id) {
      toast.error('الرجاء اختيار مجال التدريب أولاً');
      return;
    }
    if (!test.title_ar || !test.title_ar.trim()) {
      toast.error('الرجاء إدخال عنوان التقييم أولاً');
      return;
    }
    if (aiConfig.questionTypes.length === 0) {
      toast.error('الرجاء اختيار نوع واحد على الأقل من الأسئلة');
      return;
    }
    if (aiConfig.numberOfQuestions < 1 || aiConfig.numberOfQuestions > 50) {
      toast.error('عدد الأسئلة يجب أن يكون بين 1 و 50');
      return;
    }

    setGeneratingAI(true);
    
    try {
      // Get domain name
      const selectedDomain = domains.find(d => d.id === test.domain_id);
      const domainName = selectedDomain ? selectedDomain.name_ar : '';
      
      // Get selected skill names
      const selectedSkillNames = skills
        .filter(s => selectedSkills.includes(s.id))
        .map(s => s.name_ar);
      
      const response = await api.post('/tests/generate-ai', {
        domain: domainName,
        title: test.title_ar,
        description: test.description_ar || '',
        skills: selectedSkillNames,
        numberOfQuestions: aiConfig.numberOfQuestions,
        questionTypes: aiConfig.questionTypes,
        level: aiConfig.level,
      });
      
      console.log('Raw API Response:', response.data);
      
      let generatedQuestions = response.data.questions;
      
      // Ensure all MCQ options have proper text_ar strings
      if (generatedQuestions && generatedQuestions.length > 0) {
        generatedQuestions = generatedQuestions.map(q => {
          if (q.question_type === 'mcq' && q.options) {
            console.log('Processing MCQ options:', q.options);
            return {
              ...q,
              options: q.options.map((opt, idx) => {
                // Get the text from various possible field names
                let text = '';
                if (typeof opt.text_ar === 'string') {
                  text = opt.text_ar;
                } else if (typeof opt.text === 'string') {
                  text = opt.text;
                } else if (typeof opt.option === 'string') {
                  text = opt.option;
                } else if (typeof opt.content === 'string') {
                  text = opt.content;
                } else if (opt.text_ar && typeof opt.text_ar === 'object') {
                  text = JSON.stringify(opt.text_ar);
                }
                
                console.log(`Option ${idx} text:`, text, 'from:', opt);
                
                return {
                  value: opt.value || String.fromCharCode(97 + idx),
                  text_ar: text,
                  text_en: opt.text_en || '',
                  is_correct: opt.is_correct === true,
                  score: opt.is_correct ? 10 : (opt.score || 0)
                };
              })
            };
          }
          return q;
        });
        
        console.log('Processed questions:', generatedQuestions);
        
        setQuestions([...questions, ...generatedQuestions]);
        toast.success(`تم توليد ${generatedQuestions.length} سؤال بنجاح`);
        
        // Reset AI config
        setAiConfig({
          numberOfQuestions: 5,
          questionTypes: [],
          level: 'intermediate',
        });
      } else {
        toast.error('لم يتم توليد أي أسئلة');
      }
    } catch (error) {
      console.error('AI generation error:', error);
      toast.error(error.response?.data?.error || 'فشل في توليد الأسئلة');
    } finally {
      setGeneratingAI(false);
    }
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
      
      // Ensure English fields have fallbacks to Arabic
      const testData = {
        ...test,
        title_en: test.title_en || test.title_ar,
        description_en: test.description_en || test.description_ar || '',
        instructions_en: test.instructions_en || test.instructions_ar || '',
        target_skill_ids: selectedSkills
      };
      
      if (isEditing) {
        await api.put(`/tests/${id}`, testData);
      } else {
        const response = await api.post('/tests', testData);
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
        
        if (q.id && !q.id.startsWith('new-') && !q.id.startsWith('ai-')) {
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
          
          {/* Skills Selection */}
          {test.domain_id && skills.length > 0 && (
            <div className="md:col-span-2">
              <label className="label">المهارات المستهدفة</label>
              <p className="text-sm text-slate-500 mb-3">
                اختر المهارات التي سيركز عليها هذا التقييم
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-lg border border-slate-200">
                {skills.map(skill => (
                  <label 
                    key={skill.id} 
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-white transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkills.includes(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700">{skill.name_ar}</span>
                  </label>
                ))}
              </div>
              {selectedSkills.length > 0 && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-slate-600">تم اختيار:</span>
                  <span className="badge badge-primary">{selectedSkills.length} مهارة</span>
                </div>
              )}
            </div>
          )}
          
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

      {/* Add Questions Tabs */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-primary-700">إضافة الأسئلة</h2>
          <span className="badge badge-primary">{questions.length} سؤال</span>
        </div>
        
        <Tab.Group>
          <Tab.List className="flex p-1 gap-1 bg-slate-100 rounded-xl mb-6">
            <Tab
              className={({ selected }) =>
                `w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none
                ${selected 
                  ? 'bg-white text-primary-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`
              }
            >
              <PencilSquareIcon className="w-5 h-5" />
              إنشاء يدوي
            </Tab>
            <Tab
              className={({ selected }) =>
                `w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none
                ${selected 
                  ? 'bg-gradient-to-r from-primary-500 to-violet-500 text-white shadow-lg' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`
              }
            >
              <SparklesIcon className="w-5 h-5" />
              إنشاء بالذكاء الاصطناعي
            </Tab>
          </Tab.List>
          
          <Tab.Panels>
            {/* Manual Creation Panel */}
            <Tab.Panel>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-6 border border-slate-200"
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
                    <PencilSquareIcon className="w-7 h-7 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-1">إنشاء الأسئلة يدوياً</h3>
                  <p className="text-sm text-slate-500">اختر نوع السؤال لإضافته</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {questionTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => addQuestion(type.value)}
                      className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white border-2 border-slate-200 hover:border-primary-400 hover:shadow-md transition-all"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">{type.icon}</span>
                      <span className="text-sm font-medium text-slate-600 group-hover:text-primary-600">{type.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </Tab.Panel>
            
            {/* AI Generation Panel */}
            <Tab.Panel>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-primary-50/50 to-violet-50/50 rounded-xl p-6 border-2 border-dashed border-primary-200"
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
                    <SparklesIcon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-primary-700 mb-1">التوليد بالذكاء الاصطناعي</h3>
                  <p className="text-sm text-slate-500">دع الذكاء الاصطناعي يساعدك في إنشاء الأسئلة تلقائياً</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Info about using test details */}
                  <div className="md:col-span-2 bg-primary-50 border border-primary-200 rounded-lg p-4">
                    <p className="text-sm text-primary-700">
                      <span className="font-semibold">ملاحظة:</span> سيتم توليد الأسئلة بناءً على <span className="font-semibold">مجال التدريب</span>، <span className="font-semibold">المهارات المحددة</span>، <span className="font-semibold">العنوان</span> و<span className="font-semibold">الوصف</span> المدخلة أعلاه في معلومات التقييم.
                    </p>
                    {selectedSkills.length > 0 && (
                      <p className="text-sm text-primary-600 mt-2">
                        ✓ تم اختيار <span className="font-semibold">{selectedSkills.length}</span> مهارة مستهدفة
                      </p>
                    )}
                  </div>
                  
                  {/* Number of Questions */}
                  <div>
                    <label className="label">عدد الأسئلة *</label>
                    <input
                      type="number"
                      value={aiConfig.numberOfQuestions}
                      onChange={(e) => setAiConfig({ ...aiConfig, numberOfQuestions: parseInt(e.target.value) || 5 })}
                      className="input"
                      min={1}
                      max={50}
                      placeholder="5"
                    />
                  </div>
                  
                  {/* Level */}
                  <div>
                    <label className="label">مستوى الصعوبة *</label>
                    <div className="flex flex-wrap gap-2">
                      {difficultyLevels.map(level => (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => setAiConfig({ ...aiConfig, level: level.value })}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            aiConfig.level === level.value
                              ? `${level.color} ring-2 ring-offset-1 ring-primary-400`
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Question Types */}
                  <div className="md:col-span-2">
                    <label className="label">أنواع الأسئلة * (اختر واحداً أو أكثر)</label>
                    <div className="flex flex-wrap gap-2">
                      {questionTypes.map(type => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => toggleAiQuestionType(type.value)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            aiConfig.questionTypes.includes(type.value)
                              ? 'bg-primary-500 text-white ring-2 ring-offset-1 ring-primary-400'
                              : 'bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>{type.icon}</span>
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Generate Button */}
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI}
                  className="w-full btn bg-gradient-to-r from-primary-500 to-violet-500 hover:from-primary-600 hover:to-violet-600 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {generatingAI ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      جاري التوليد...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-5 h-5" />
                      توليد الأسئلة بالذكاء الاصطناعي
                    </>
                  )}
                </button>
              </motion.div>
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>

      {/* Questions List */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary-700">الأسئلة المضافة ({questions.length})</h2>
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
                        <div
                          onClick={(e) => { e.stopPropagation(); removeQuestion(index); }}
                          className="p-1 text-slate-400 hover:text-danger-500 cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); removeQuestion(index); } }}
                        >
                          <TrashIcon className="w-5 h-5" />
                        </div>
                        <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </div>
                    </Disclosure.Button>
                    
                    <Disclosure.Panel className="p-4 space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
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
                        <label className="label">الوزن</label>
                        <input
                          type="number"
                          value={question.weight}
                          onChange={(e) => updateQuestion(index, { weight: parseFloat(e.target.value) || 1 })}
                          className="input w-16"
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
                          <div className="space-y-3">
                            {(question.options || []).map((option, optIndex) => {
                              // Ensure text_ar is always a string
                              const optionText = typeof option.text_ar === 'string' ? option.text_ar : 
                                                 (option.text_ar ? String(option.text_ar) : '');
                              return (
                                <div key={option.value || optIndex} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                                  {/* Option Label and Text */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-slate-700 font-semibold text-lg min-w-[24px]">
                                      ({option.value || String.fromCharCode(97 + optIndex)})
                                    </span>
                                    <div className="flex-1">
                                      <input
                                        type="text"
                                        value={optionText}
                                        onChange={(e) => updateOption(index, optIndex, { text_ar: e.target.value })}
                                        className="input w-full"
                                        placeholder="اكتب نص الخيار هنا..."
                                        dir="rtl"
                                      />
                                    </div>
                                  </div>
                                  
                                  {/* Score and Controls */}
                                  <div className="flex items-center justify-between gap-3 pr-8">
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-2">
                                        <label className="text-sm text-slate-600">الوزن:</label>
                                        <input
                                          type="number"
                                          value={option.score || 0}
                                          onChange={(e) => updateOption(index, optIndex, { score: parseInt(e.target.value) || 0 })}
                                          className="input w-14 text-center px-2 py-1.5"
                                          placeholder="0"
                                        />
                                      </div>
                                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-md border border-slate-200 hover:border-success-400 transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={option.is_correct || false}
                                          onChange={(e) => updateOption(index, optIndex, { is_correct: e.target.checked })}
                                          className="w-4 h-4 rounded border-slate-300 text-success-600"
                                        />
                                        <span className="text-sm text-slate-700 font-medium">صحيح</span>
                                      </label>
                                    </div>
                                    <button
                                      onClick={() => removeOption(index, optIndex)}
                                      className="p-2 text-slate-400 hover:text-danger-500 hover:bg-danger-50 rounded-md transition-colors"
                                      title="حذف الخيار"
                                    >
                                      <XMarkIcon className="w-5 h-5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => addOption(index)}
                            className="mt-3 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium px-3 py-2 rounded-md hover:bg-primary-50 transition-colors"
                          >
                            <PlusIcon className="w-4 h-4" />
                            إضافة خيار
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

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={cancelDeleteQuestion}
        onConfirm={confirmDeleteQuestion}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا السؤال؟ لا يمكن التراجع عن هذا الإجراء."
      />
    </div>
  );
}

