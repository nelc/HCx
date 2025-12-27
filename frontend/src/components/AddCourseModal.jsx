import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PlusCircleIcon, 
  XMarkIcon,
  PlusIcon,
  ArrowPathIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function AddCourseModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  filterOptions = {}
}) {
  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    description_ar: '',
    difficulty_level: '',
    provider: '',
    university: '',
    duration_hours: '',
    url: '',
  });
  const [domains, setDomains] = useState(['', '']); // Support 2 domains
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState('');
  const [availableSkills, setAvailableSkills] = useState([]);
  const [availableDomains, setAvailableDomains] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name_ar: '',
        name_en: '',
        description_ar: '',
        difficulty_level: '',
        provider: '',
        university: '',
        duration_hours: '',
        url: '',
      });
      setDomains(['', '']);
      setSkills([]);
      setNewSkill('');
    }
  }, [isOpen]);

  // Fetch available skills for autocomplete
  useEffect(() => {
    if (isOpen && availableSkills.length === 0) {
      fetchAvailableSkills();
    }
  }, [isOpen]);

  // Fetch available domains for autocomplete
  useEffect(() => {
    if (isOpen && availableDomains.length === 0) {
      fetchAvailableDomains();
    }
  }, [isOpen]);

  const fetchAvailableSkills = async () => {
    setLoadingSkills(true);
    try {
      // Fetch from both Neo4j and PostgreSQL in parallel
      const [neo4jResponse, pgResponse] = await Promise.allSettled([
        api.get('/courses/neo4j/skills'),
        api.get('/skills')
      ]);

      const combinedSkills = [];
      const seenSkills = new Set();

      // Add Neo4j skills
      if (neo4jResponse.status === 'fulfilled' && neo4jResponse.value?.data) {
        neo4jResponse.value.data.forEach(skill => {
          const key = (skill.name_ar || skill.name_en || '').toLowerCase();
          if (key && !seenSkills.has(key)) {
            seenSkills.add(key);
            combinedSkills.push(skill);
          }
        });
      }

      // Add PostgreSQL skills
      if (pgResponse.status === 'fulfilled' && pgResponse.value?.data) {
        pgResponse.value.data.forEach(skill => {
          const key = (skill.name_ar || skill.name_en || '').toLowerCase();
          if (key && !seenSkills.has(key)) {
            seenSkills.add(key);
            combinedSkills.push(skill);
          }
        });
      }

      // Use filter options as additional fallback
      if (filterOptions.skills) {
        filterOptions.skills.forEach(s => {
          const key = s.toLowerCase();
          if (!seenSkills.has(key)) {
            seenSkills.add(key);
            combinedSkills.push({ name_ar: s, name_en: s });
          }
        });
      }

      // Sort alphabetically by Arabic name
      combinedSkills.sort((a, b) => (a.name_ar || '').localeCompare(b.name_ar || '', 'ar'));
      
      setAvailableSkills(combinedSkills);
      console.log(`✅ Loaded ${combinedSkills.length} skills from Neo4j + PostgreSQL`);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      // Use filter options as fallback
      if (filterOptions.skills) {
        setAvailableSkills(filterOptions.skills.map(s => ({ name_ar: s, name_en: s })));
      }
    } finally {
      setLoadingSkills(false);
    }
  };

  const fetchAvailableDomains = async () => {
    try {
      // Fetch PostgreSQL training domains
      const response = await api.get('/domains');
      const pgDomains = response.data || [];
      
      // Combine with Neo4j subjects from filterOptions
      const combinedDomains = [...pgDomains];
      const seenNames = new Set(pgDomains.map(d => (d.name_ar || '').toLowerCase()));
      
      // Add Neo4j subjects that aren't already in the list
      if (filterOptions.subjects) {
        filterOptions.subjects.forEach(subject => {
          const key = subject.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            combinedDomains.push({ 
              id: `neo4j-${subject}`, 
              name_ar: subject, 
              name_en: subject,
              source: 'neo4j'
            });
          }
        });
      }

      // Sort alphabetically by Arabic name
      combinedDomains.sort((a, b) => (a.name_ar || '').localeCompare(b.name_ar || '', 'ar'));
      
      setAvailableDomains(combinedDomains);
      console.log(`✅ Loaded ${combinedDomains.length} domains from PostgreSQL + Neo4j`);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
      // Use Neo4j subjects as fallback
      if (filterOptions.subjects) {
        setAvailableDomains(filterOptions.subjects.map(s => ({ 
          id: `neo4j-${s}`, 
          name_ar: s, 
          name_en: s 
        })));
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDomainChange = (index, value) => {
    setDomains(prev => {
      const newDomains = [...prev];
      newDomains[index] = value;
      return newDomains;
    });
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills(prev => [...prev, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(prev => prev.filter(s => s !== skillToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name_ar.trim()) {
      toast.error('يرجى إدخال اسم الدورة بالعربية');
      return;
    }

    if (!domains[0]?.trim()) {
      toast.error('يرجى تحديد المجال الرئيسي للدورة');
      return;
    }

    setSaving(true);
    const toastId = toast.loading('جاري إضافة الدورة...');

    try {
      // Prepare the course data
      const validDomains = domains.filter(d => d && d.trim());
      
      const courseData = {
        name_ar: formData.name_ar.trim(),
        name_en: formData.name_en?.trim() || null,
        description_ar: formData.description_ar?.trim() || null,
        difficulty_level: formData.difficulty_level || null,
        provider: formData.provider?.trim() || null,
        university: formData.university?.trim() || null,
        duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
        url: formData.url?.trim() || null,
        subject: validDomains[0], // Primary domain as subject
        skill_tags: skills.length > 0 ? skills : null, // Skills as string array
      };

      // Remove null fields
      Object.keys(courseData).forEach(key => {
        if (courseData[key] === null || courseData[key] === '') {
          delete courseData[key];
        }
      });

      // Add course via API
      const response = await api.post('/courses', courseData);

      toast.dismiss(toastId);
      toast.success('تم إضافة الدورة بنجاح');
      
      // Call onSuccess with the new course
      if (onSuccess) {
        onSuccess(response.data);
      }
      
      onClose();
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Add course error:', error);
      toast.error(error.response?.data?.error || error.response?.data?.message || 'فشل في إضافة الدورة');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const difficultyOptions = [
    { value: '', label: 'اختر المستوى...' },
    { value: 'beginner', label: 'مبتدئ' },
    { value: 'intermediate', label: 'متوسط' },
    { value: 'advanced', label: 'متقدم' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <PlusCircleIcon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-800">إضافة دورة جديدة</h3>
                <p className="text-sm text-slate-500">إضافة دورة خارجية من مصادر مختلفة</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Course Name Arabic - Required */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                اسم الدورة (عربي) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name_ar"
                value={formData.name_ar}
                onChange={handleChange}
                className="input w-full"
                placeholder="اسم الدورة بالعربية"
                required
              />
            </div>

            {/* Course Name English */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                اسم الدورة (إنجليزي)
              </label>
              <input
                type="text"
                name="name_en"
                value={formData.name_en}
                onChange={handleChange}
                className="input w-full"
                placeholder="Course name in English"
                dir="ltr"
              />
            </div>

            {/* Domains (2 domains for better recommendations) */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                المجالات <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">المجال الأول (رئيسي) <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={domains[0]}
                    onChange={(e) => handleDomainChange(0, e.target.value)}
                    className="input w-full"
                    placeholder="مثال: إدارة الأعمال، تقنية المعلومات..."
                    list="domains-list-1"
                    required
                  />
                  <datalist id="domains-list-1">
                    {availableDomains.map(domain => (
                      <option key={domain.id} value={domain.name_ar} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">المجال الثاني (اختياري)</label>
                  <input
                    type="text"
                    value={domains[1]}
                    onChange={(e) => handleDomainChange(1, e.target.value)}
                    className="input w-full"
                    placeholder="مجال إضافي للدورة..."
                    list="domains-list-2"
                  />
                  <datalist id="domains-list-2">
                    {availableDomains.map(domain => (
                      <option key={domain.id} value={domain.name_ar} />
                    ))}
                  </datalist>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                إضافة مجالين يساعد في تحسين دقة التوصيات للموظفين
              </p>
            </div>

            {/* Difficulty Level */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                مستوى الصعوبة
              </label>
              <select
                name="difficulty_level"
                value={formData.difficulty_level}
                onChange={handleChange}
                className="input w-full"
              >
                {difficultyOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Provider & University */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  المزود
                </label>
                <input
                  type="text"
                  name="provider"
                  value={formData.provider}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder="مثال: Coursera, edX, Udemy..."
                  list="providers-list"
                />
                <datalist id="providers-list">
                  <option value="Coursera" />
                  <option value="edX" />
                  <option value="Udemy" />
                  <option value="LinkedIn Learning" />
                  <option value="FutureX" />
                  <option value="Rwaq" />
                  <option value="Doroob" />
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  الجامعة/المؤسسة
                </label>
                <input
                  type="text"
                  name="university"
                  value={formData.university}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder="اسم الجامعة أو المؤسسة"
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                المدة (بالساعات)
              </label>
              <input
                type="number"
                name="duration_hours"
                value={formData.duration_hours}
                onChange={handleChange}
                className="input w-full"
                placeholder="عدد الساعات"
                min="0"
                step="0.5"
              />
            </div>

            {/* Course URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                رابط الدورة
              </label>
              <div className="relative">
                <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  className="input w-full pr-10"
                  placeholder="https://example.com/course"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                الوصف
              </label>
              <textarea
                name="description_ar"
                value={formData.description_ar}
                onChange={handleChange}
                className="input w-full h-24 resize-none"
                placeholder="وصف الدورة ومحتواها..."
              />
            </div>

            {/* Skills Section */}
            <div className="border-t pt-5">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                المهارات المرتبطة
              </label>
              
              {/* Current Skills */}
              <div className="flex flex-wrap gap-2 mb-3 min-h-[40px]">
                {skills.length === 0 ? (
                  <span className="text-sm text-slate-400 italic">لا توجد مهارات مضافة بعد</span>
                ) : (
                  skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2 group"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="text-green-500 hover:text-red-500 transition-colors"
                        title="إزالة المهارة"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add New Skill */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                    className="input w-full"
                    placeholder="أدخل اسم المهارة..."
                    list="skills-list"
                  />
                  <datalist id="skills-list">
                    {availableSkills.map((skill, idx) => (
                      <option key={idx} value={skill.name_ar || skill.name_en} />
                    ))}
                  </datalist>
                </div>
                <button
                  type="button"
                  onClick={handleAddSkill}
                  disabled={!newSkill.trim()}
                  className="btn btn-secondary px-4 disabled:opacity-50"
                >
                  <PlusIcon className="w-5 h-5" />
                  إضافة
                </button>
              </div>
              
              {loadingSkills && (
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <ArrowPathIcon className="w-3 h-3 animate-spin" />
                  جاري تحميل قائمة المهارات...
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                disabled={saving}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving || !formData.name_ar.trim() || !domains[0]?.trim()}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    جاري الإضافة...
                  </>
                ) : (
                  <>
                    <PlusCircleIcon className="w-5 h-5" />
                    إضافة الدورة
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

