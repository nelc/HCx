import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PencilSquareIcon, 
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function EditCourseModal({ 
  isOpen, 
  onClose, 
  course,
  onSave,
  filterOptions = {}
}) {
  const [formData, setFormData] = useState({
    subject: '',
    difficulty_level: '',
    name_ar: '',
    name_en: '',
    description_ar: '',
    provider: '',
    university: '',
    duration_hours: '',
  });
  const [domains, setDomains] = useState(['', '']); // Support 2 domains
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState('');
  const [availableSkills, setAvailableSkills] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);

  // Initialize form with course data
  useEffect(() => {
    if (course && isOpen) {
      setFormData({
        subject: course.subject || '',
        difficulty_level: course.difficulty_level || 'beginner',
        name_ar: course.name_ar || '',
        name_en: course.name_en || '',
        description_ar: course.description_ar || '',
        provider: course.provider || '',
        university: course.university || '',
        duration_hours: course.duration_hours || '',
      });
      
      // Initialize domains (support both array and single subject)
      if (course.domains && Array.isArray(course.domains)) {
        setDomains([course.domains[0] || '', course.domains[1] || '']);
      } else if (course.subject) {
        setDomains([course.subject, '']);
      } else {
        setDomains(['', '']);
      }
      
      // Initialize skills from course
      const courseSkills = (course.skills || [])
        .filter(s => s && (s.name_ar || s.name_en))
        .map(s => s.name_ar || s.name_en);
      setSkills(courseSkills);
    }
  }, [course, isOpen]);

  // Fetch available skills for autocomplete
  useEffect(() => {
    if (isOpen && availableSkills.length === 0) {
      fetchAvailableSkills();
    }
  }, [isOpen]);

  const fetchAvailableSkills = async () => {
    setLoadingSkills(true);
    try {
      const response = await api.get('/courses/neo4j/skills');
      setAvailableSkills(response.data || []);
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

  const handleSave = async () => {
    if (!course?.id) {
      toast.error('معرف الدورة غير متوفر');
      return;
    }

    setSaving(true);
    const toastId = toast.loading('جاري حفظ التغييرات...');

    try {
      // 1. Update course metadata
      const updates = {};
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          updates[key] = key === 'duration_hours' ? parseFloat(value) : value;
        }
      });

      // Add domains to updates (filter out empty ones)
      const validDomains = domains.filter(d => d && d.trim());
      if (validDomains.length > 0) {
        updates.domains = validDomains;
        // Also set subject to first domain for backward compatibility
        updates.subject = validDomains[0];
      }

      if (Object.keys(updates).length > 0) {
        await api.patch(`/courses/neo4j/${course.id}`, updates);
      }

      // 2. Handle skill changes
      const originalSkills = (course.skills || [])
        .filter(s => s && (s.name_ar || s.name_en))
        .map(s => s.name_ar || s.name_en);
      
      // Skills to remove
      const skillsToRemove = originalSkills.filter(s => !skills.includes(s));
      for (const skill of skillsToRemove) {
        try {
          await api.delete(`/courses/neo4j/${course.id}/skills/${encodeURIComponent(skill)}`);
        } catch (err) {
          console.error(`Failed to remove skill ${skill}:`, err);
        }
      }

      // Skills to add
      const skillsToAdd = skills.filter(s => !originalSkills.includes(s));
      for (const skill of skillsToAdd) {
        try {
          await api.post(`/courses/neo4j/${course.id}/skills`, { skill_name: skill });
        } catch (err) {
          console.error(`Failed to add skill ${skill}:`, err);
        }
      }

      toast.dismiss(toastId);
      toast.success('تم حفظ التغييرات بنجاح');
      
      // Call onSave with updated data
      if (onSave) {
        const validDomains = domains.filter(d => d && d.trim());
        onSave({
          ...course,
          ...formData,
          domains: validDomains,
          subject: validDomains[0] || formData.subject,
          skills: skills.map(s => ({ name_ar: s, name_en: s }))
        });
      }
      
      onClose();
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Save error:', error);
      toast.error(error.response?.data?.message || 'فشل في حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const difficultyOptions = [
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
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <PencilSquareIcon className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-800">تعديل الدورة</h3>
                <p className="text-sm text-slate-500">تعديل بيانات ومهارات الدورة</p>
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
          <div className="space-y-5">
            {/* Course Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                اسم الدورة (عربي)
              </label>
              <input
                type="text"
                name="name_ar"
                value={formData.name_ar}
                onChange={handleChange}
                className="input w-full"
                placeholder="اسم الدورة بالعربية"
              />
            </div>

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
                المجالات (حتى مجالين لتحسين دقة التوصيات)
              </label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">المجال الأول (رئيسي)</label>
                  <input
                    type="text"
                    value={domains[0]}
                    onChange={(e) => handleDomainChange(0, e.target.value)}
                    className="input w-full"
                    placeholder="مثال: إدارة الأعمال، تقنية المعلومات..."
                    list="subjects-list-1"
                  />
                  {filterOptions.subjects?.length > 0 && (
                    <datalist id="subjects-list-1">
                      {filterOptions.subjects.map(subject => (
                        <option key={subject} value={subject} />
                      ))}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">المجال الثاني (اختياري)</label>
                  <input
                    type="text"
                    value={domains[1]}
                    onChange={(e) => handleDomainChange(1, e.target.value)}
                    className="input w-full"
                    placeholder="مجال إضافي للدورة..."
                    list="subjects-list-2"
                  />
                  {filterOptions.subjects?.length > 0 && (
                    <datalist id="subjects-list-2">
                      {filterOptions.subjects.map(subject => (
                        <option key={subject} value={subject} />
                      ))}
                    </datalist>
                  )}
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
                  placeholder="مثال: Coursera, edX..."
                />
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
                placeholder="وصف الدورة..."
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
                  <span className="text-sm text-slate-400 italic">لا توجد مهارات مرتبطة</span>
                ) : (
                  skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2 group"
                    >
                      {skill}
                      <button
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
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
              disabled={saving}
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                'حفظ التغييرات'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
