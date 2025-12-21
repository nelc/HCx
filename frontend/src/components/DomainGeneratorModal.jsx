import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  FolderIcon,
  TagIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const colorOptions = [
  '#502390', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'
];

export default function DomainGeneratorModal({ isOpen, onClose, department }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedData, setGeneratedData] = useState(null);
  const [domains, setDomains] = useState([]);
  const [expandedDomains, setExpandedDomains] = useState({});
  const [editingDomain, setEditingDomain] = useState(null);
  const [editingSkill, setEditingSkill] = useState(null);

  const handleGenerate = async () => {
    if (!department?.id) return;

    setLoading(true);
    try {
      const response = await api.post(`/departments/${department.id}/generate-domains`);
      setGeneratedData(response.data);
      setDomains(response.data.domains || []);
      
      // Expand all domains by default
      const expanded = {};
      (response.data.domains || []).forEach((_, index) => {
        expanded[index] = true;
      });
      setExpandedDomains(expanded);
      
      toast.success(`تم توليد ${response.data.domains?.length || 0} مجال بنجاح`);
    } catch (error) {
      console.error('Generate domains error:', error);
      toast.error(error.response?.data?.error_ar || error.response?.data?.error || 'فشل في توليد المجالات');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (domains.length === 0) {
      toast.error('يجب إضافة مجال واحد على الأقل');
      return;
    }

    // Validate domains
    for (const domain of domains) {
      if (!domain.name_ar?.trim() || !domain.name_en?.trim()) {
        toast.error('يجب إدخال اسم المجال بالعربية والإنجليزية');
        return;
      }
      if (!domain.skills || domain.skills.length === 0) {
        toast.error(`يجب إضافة مهارة واحدة على الأقل للمجال "${domain.name_ar}"`);
        return;
      }
      for (const skill of domain.skills) {
        if (!skill.name_ar?.trim() || !skill.name_en?.trim()) {
          toast.error(`يجب إدخال اسم المهارة بالعربية والإنجليزية في المجال "${domain.name_ar}"`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const response = await api.post(`/departments/${department.id}/save-domains`, { domains });
      toast.success(response.data.message_ar || 'تم حفظ المجالات بنجاح');
      onClose();
      setGeneratedData(null);
      setDomains([]);
    } catch (error) {
      console.error('Save domains error:', error);
      toast.error(error.response?.data?.error || 'فشل في حفظ المجالات');
    } finally {
      setSaving(false);
    }
  };

  const toggleDomainExpand = (index) => {
    setExpandedDomains(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const addDomain = () => {
    const newDomain = {
      name_ar: '',
      name_en: '',
      description_ar: '',
      description_en: '',
      color: colorOptions[domains.length % colorOptions.length],
      skills: []
    };
    setDomains([...domains, newDomain]);
    setExpandedDomains(prev => ({ ...prev, [domains.length]: true }));
    setEditingDomain(domains.length);
  };

  const updateDomain = (index, field, value) => {
    const updated = [...domains];
    updated[index] = { ...updated[index], [field]: value };
    setDomains(updated);
  };

  const removeDomain = (index) => {
    setDomains(domains.filter((_, i) => i !== index));
    setEditingDomain(null);
  };

  const addSkill = (domainIndex) => {
    const updated = [...domains];
    updated[domainIndex].skills = [
      ...(updated[domainIndex].skills || []),
      { name_ar: '', name_en: '', description_ar: '', description_en: '' }
    ];
    setDomains(updated);
    setEditingSkill({ domainIndex, skillIndex: updated[domainIndex].skills.length - 1 });
  };

  const updateSkill = (domainIndex, skillIndex, field, value) => {
    const updated = [...domains];
    updated[domainIndex].skills[skillIndex] = {
      ...updated[domainIndex].skills[skillIndex],
      [field]: value
    };
    setDomains(updated);
  };

  const removeSkill = (domainIndex, skillIndex) => {
    const updated = [...domains];
    updated[domainIndex].skills = updated[domainIndex].skills.filter((_, i) => i !== skillIndex);
    setDomains(updated);
    setEditingSkill(null);
  };

  const handleClose = () => {
    setGeneratedData(null);
    setDomains([]);
    setExpandedDomains({});
    setEditingDomain(null);
    setEditingSkill(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-start justify-between">
              <div>
                <Dialog.Title className="text-xl font-bold text-primary-700 flex items-center gap-2">
                  <SparklesIcon className="w-6 h-6" />
                  توليد المجالات والمهارات
                </Dialog.Title>
                {department && (
                  <p className="text-sm text-slate-500 mt-1">
                    لـ {department.name_ar}
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {!generatedData && domains.length === 0 ? (
              // Initial state - show generate button
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <SparklesIcon className="w-10 h-10 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  توليد المجالات والمهارات بالذكاء الاصطناعي
                </h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  سيقوم النظام بتحليل الهدف والمسؤوليات المحددة للوحدة التنظيمية وتوليد مجالات تدريبية ومهارات مناسبة.
                </p>
                
                {department && (
                  <div className="bg-slate-50 rounded-lg p-4 mb-6 text-right max-w-lg mx-auto">
                    {department.objective_ar && (
                      <div className="mb-3">
                        <span className="text-xs font-medium text-slate-500">الهدف:</span>
                        <p className="text-sm text-slate-700 mt-1">{department.objective_ar}</p>
                      </div>
                    )}
                    {department.responsibilities && department.responsibilities.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-slate-500">
                          المسؤوليات ({department.responsibilities.length}):
                        </span>
                        <ul className="text-sm text-slate-700 mt-1 space-y-1">
                          {department.responsibilities.slice(0, 3).map((r, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-slate-400">•</span>
                              <span>{r.text_ar || r.text_en}</span>
                            </li>
                          ))}
                          {department.responsibilities.length > 3 && (
                            <li className="text-slate-400 text-xs">
                              +{department.responsibilities.length - 3} مسؤوليات أخرى
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="btn btn-primary px-8"
                >
                  {loading ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      جاري التوليد...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-5 h-5" />
                      توليد المجالات
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Generated domains - editable list
              <div className="space-y-4">
                {/* Analysis summary */}
                {generatedData?.analysis && (
                  <div className="bg-gradient-to-l from-primary-50 to-accent-50 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-slate-800 mb-2">تحليل الذكاء الاصطناعي</h4>
                    <p className="text-sm text-slate-600">{generatedData.analysis.recommendations_ar}</p>
                    {generatedData.analysis.key_competency_areas && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {generatedData.analysis.key_competency_areas.map((area, i) => (
                          <span key={i} className="px-2 py-1 bg-white/50 text-primary-700 text-xs rounded-full">
                            {area}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Domains list */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-700">
                    المجالات ({domains.length})
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={loading}
                      className="btn btn-secondary btn-sm"
                    >
                      {loading ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                      )}
                      إعادة التوليد
                    </button>
                    <button onClick={addDomain} className="btn btn-secondary btn-sm">
                      <PlusIcon className="w-4 h-4" />
                      إضافة مجال
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {domains.map((domain, domainIndex) => (
                    <motion.div
                      key={domainIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border border-slate-200 rounded-lg overflow-hidden"
                    >
                      {/* Domain header */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50"
                        onClick={() => toggleDomainExpand(domainIndex)}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: (domain.color || '#502390') + '20' }}
                        >
                          <FolderIcon className="w-5 h-5" style={{ color: domain.color || '#502390' }} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {editingDomain === domainIndex ? (
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={domain.name_ar}
                                onChange={(e) => updateDomain(domainIndex, 'name_ar', e.target.value)}
                                className="input text-sm flex-1"
                                placeholder="اسم المجال بالعربية"
                                autoFocus
                              />
                              <input
                                type="text"
                                value={domain.name_en}
                                onChange={(e) => updateDomain(domainIndex, 'name_en', e.target.value)}
                                className="input text-sm flex-1"
                                placeholder="Domain name"
                                dir="ltr"
                              />
                              <button
                                onClick={() => setEditingDomain(null)}
                                className="btn btn-primary btn-sm"
                              >
                                <CheckIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <h5 className="font-semibold text-slate-800">{domain.name_ar || 'مجال جديد'}</h5>
                              <p className="text-xs text-slate-500">{domain.name_en}</p>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {domain.skills?.length || 0} مهارة
                          </span>
                          
                          {/* Color picker */}
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {colorOptions.slice(0, 4).map((color) => (
                              <button
                                key={color}
                                onClick={() => updateDomain(domainIndex, 'color', color)}
                                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                                  domain.color === color ? 'border-slate-400 scale-110' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDomain(editingDomain === domainIndex ? null : domainIndex);
                            }}
                            className="p-1.5 text-slate-400 hover:text-primary-600 rounded"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeDomain(domainIndex);
                            }}
                            className="p-1.5 text-slate-400 hover:text-danger-600 rounded"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                          {expandedDomains[domainIndex] ? (
                            <ChevronUpIcon className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDownIcon className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Domain content (skills) */}
                      <AnimatePresence>
                        {expandedDomains[domainIndex] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100"
                          >
                            <div className="p-4 bg-slate-50">
                              {/* Domain description */}
                              {editingDomain === domainIndex && (
                                <div className="mb-4 space-y-2">
                                  <textarea
                                    value={domain.description_ar}
                                    onChange={(e) => updateDomain(domainIndex, 'description_ar', e.target.value)}
                                    className="input text-sm resize-none"
                                    rows={2}
                                    placeholder="وصف المجال بالعربية..."
                                  />
                                  <textarea
                                    value={domain.description_en}
                                    onChange={(e) => updateDomain(domainIndex, 'description_en', e.target.value)}
                                    className="input text-sm resize-none"
                                    rows={2}
                                    placeholder="Domain description..."
                                    dir="ltr"
                                  />
                                </div>
                              )}

                              {/* Skills list */}
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-slate-600 flex items-center gap-1">
                                  <TagIcon className="w-4 h-4" />
                                  المهارات
                                </span>
                                <button
                                  onClick={() => addSkill(domainIndex)}
                                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                  <PlusIcon className="w-4 h-4" />
                                  إضافة مهارة
                                </button>
                              </div>

                              {domain.skills && domain.skills.length > 0 ? (
                                <div className="space-y-2">
                                  {domain.skills.map((skill, skillIndex) => (
                                    <div
                                      key={skillIndex}
                                      className="flex items-center gap-2 p-2 bg-white rounded-lg"
                                    >
                                      <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: domain.color || '#502390' }}
                                      />
                                      
                                      {editingSkill?.domainIndex === domainIndex && editingSkill?.skillIndex === skillIndex ? (
                                        <div className="flex-1 flex gap-2">
                                          <input
                                            type="text"
                                            value={skill.name_ar}
                                            onChange={(e) => updateSkill(domainIndex, skillIndex, 'name_ar', e.target.value)}
                                            className="input text-sm flex-1"
                                            placeholder="اسم المهارة بالعربية"
                                            autoFocus
                                          />
                                          <input
                                            type="text"
                                            value={skill.name_en}
                                            onChange={(e) => updateSkill(domainIndex, skillIndex, 'name_en', e.target.value)}
                                            className="input text-sm flex-1"
                                            placeholder="Skill name"
                                            dir="ltr"
                                          />
                                          <button
                                            onClick={() => setEditingSkill(null)}
                                            className="btn btn-primary btn-sm"
                                          >
                                            <CheckIcon className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-800">{skill.name_ar || 'مهارة جديدة'}</p>
                                            <p className="text-xs text-slate-500">{skill.name_en}</p>
                                          </div>
                                          <button
                                            onClick={() => setEditingSkill({ domainIndex, skillIndex })}
                                            className="p-1 text-slate-400 hover:text-primary-600 rounded"
                                          >
                                            <PencilIcon className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => removeSkill(domainIndex, skillIndex)}
                                            className="p-1 text-slate-400 hover:text-danger-600 rounded"
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-sm text-slate-400">
                                  لا توجد مهارات - أضف مهارة جديدة
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Footer */}
          {domains.length > 0 && (
            <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={handleClose} className="btn btn-secondary">
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-5 h-5" />
                    حفظ المجالات
                  </>
                )}
              </button>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

