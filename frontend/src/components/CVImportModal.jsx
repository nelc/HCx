import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { uploadCV, confirmCVImport } from '../utils/api';

const STAGES = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  PREVIEW: 'preview',
  SUCCESS: 'success',
};

export default function CVImportModal({ isOpen, onClose, onSuccess }) {
  const [stage, setStage] = useState(STAGES.UPLOAD);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedPossibleSkills, setSelectedPossibleSkills] = useState([]);
  const [editingData, setEditingData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Validate file type
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      toast.error('نوع الملف غير مدعوم. يرجى رفع ملف PDF أو DOC أو DOCX');
      return;
    }

    // Validate file size (5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت');
      return;
    }

    setFile(selectedFile);
    handleUpload(selectedFile);
  };

  const handleUpload = async (fileToUpload) => {
    setIsProcessing(true);
    setStage(STAGES.PROCESSING);

    try {
      const formData = new FormData();
      formData.append('cv', fileToUpload);

      const response = await uploadCV(fileToUpload);
      const data = response.data;

      // Initialize editing data
      setEditingData({
        personal: {
          phone: data.extractedData?.phone || '',
        },
        education: data.extractedData?.education || [],
        experience: data.extractedData?.experience || [],
        certificates: data.extractedData?.certificates || [],
      });

      // Initialize selected skills (select all by default)
      const allSkillIds = data.matchedSkills.map(s => s.skill_id);
      setSelectedSkills(allSkillIds);
      
      // Initialize selected possible skills (select all by default)
      const allPossibleSkillIds = data.matchedPossibleSkills?.map(s => s.skill_id) || [];
      setSelectedPossibleSkills(allPossibleSkillIds);

      setPreviewData(data);
      setStage(STAGES.PREVIEW);
    } catch (error) {
      console.error('CV upload error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'فشل في معالجة السيرة الذاتية';
      toast.error(errorMessage);
      setStage(STAGES.UPLOAD);
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData || (selectedSkills.length === 0 && selectedPossibleSkills.length === 0)) {
      toast.error('يرجى اختيار مهارة واحدة على الأقل');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await confirmCVImport({
        extractedData: {
          ...previewData.extractedData,
          phone: editingData.personal.phone,
          education: editingData.education,
          experience: editingData.experience,
          certificates: editingData.certificates,
        },
        selectedSkills,
        selectedPossibleSkills,
        fileName: file.name,
        fileSize: file.size,
      });

      toast.success(response.data.message || 'تم استيراد السيرة الذاتية بنجاح');
      setStage(STAGES.SUCCESS);
      
      if (onSuccess) {
        onSuccess(response.data);
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('CV import confirmation error:', error);
      toast.error(error.response?.data?.message || 'فشل في استيراد البيانات');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStage(STAGES.UPLOAD);
    setFile(null);
    setPreviewData(null);
    setSelectedSkills([]);
    setEditingData(null);
    setIsProcessing(false);
    onClose();
  };

  const toggleSkill = (skillId) => {
    setSelectedSkills(prev => 
      prev.includes(skillId) 
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  const togglePossibleSkill = (skillId) => {
    setSelectedPossibleSkills(prev => 
      prev.includes(skillId) 
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  const addEducation = () => {
    setEditingData(prev => ({
      ...prev,
      education: [...prev.education, { degree: '', institution: '', graduation_year: '' }],
    }));
  };

  const updateEducation = (index, field, value) => {
    setEditingData(prev => ({
      ...prev,
      education: prev.education.map((edu, i) => 
        i === index ? { ...edu, [field]: value } : edu
      ),
    }));
  };

  const removeEducation = (index) => {
    setEditingData(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  const addExperience = () => {
    setEditingData(prev => ({
      ...prev,
      experience: [...prev.experience, { title: '', company: '', start_date: '', end_date: '', description: '' }],
    }));
  };

  const updateExperience = (index, field, value) => {
    setEditingData(prev => ({
      ...prev,
      experience: prev.experience.map((exp, i) => 
        i === index ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  const removeExperience = (index) => {
    setEditingData(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  };

  const addCertificate = () => {
    setEditingData(prev => ({
      ...prev,
      certificates: [...prev.certificates, { name: '', issuer: '', date: '' }],
    }));
  };

  const updateCertificate = (index, field, value) => {
    setEditingData(prev => ({
      ...prev,
      certificates: prev.certificates.map((cert, i) => 
        i === index ? { ...cert, [field]: value } : cert
      ),
    }));
  };

  const removeCertificate = (index) => {
    setEditingData(prev => ({
      ...prev,
      certificates: prev.certificates.filter((_, i) => i !== index),
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-primary-700">استيراد من السيرة الذاتية</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* Upload Stage */}
            {stage === STAGES.UPLOAD && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center py-8"
              >
                <DocumentArrowUpIcon className="w-16 h-16 text-primary-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-2">رفع السيرة الذاتية</h3>
                <p className="text-slate-500 mb-6">اختر ملف PDF أو DOC أو DOCX (حد أقصى 5 ميجابايت)</p>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-primary"
                >
                  اختر الملف
                </button>
                
                {file && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Processing Stage */}
            {stage === STAGES.PROCESSING && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">جاري معالجة السيرة الذاتية</h3>
                <p className="text-slate-500">يرجى الانتظار...</p>
              </motion.div>
            )}

            {/* Preview Stage */}
            {stage === STAGES.PREVIEW && previewData && editingData && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                  <p className="text-sm text-primary-700">
                    تم استخراج البيانات بنجاح. يرجى مراجعة المعلومات وتأكيد الاستيراد.
                  </p>
                </div>

                {/* Personal Info */}
                <div className="card p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">المعلومات الشخصية</h3>
                  <div>
                    <label className="label text-sm">رقم الهاتف</label>
                    <input
                      type="text"
                      value={editingData.personal.phone}
                      onChange={(e) => setEditingData(prev => ({
                        ...prev,
                        personal: { ...prev.personal, phone: e.target.value }
                      }))}
                      className="input"
                      placeholder="+966500000000"
                    />
                  </div>
                </div>

                {/* Education */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">التعليم</h3>
                    <button
                      onClick={addEducation}
                      className="btn btn-secondary text-sm py-1 px-3"
                    >
                      <PlusIcon className="w-4 h-4 inline ml-1" />
                      إضافة
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editingData.education.map((edu, index) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={edu.degree || ''}
                              onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                              className="input text-sm w-full"
                              placeholder="الدرجة العلمية"
                            />
                            <input
                              type="text"
                              value={edu.institution || ''}
                              onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                              className="input text-sm w-full"
                              placeholder="المؤسسة"
                            />
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={edu.graduation_year || ''}
                                onChange={(e) => updateEducation(index, 'graduation_year', e.target.value)}
                                className="input text-sm w-32"
                                placeholder="السنة"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => removeEducation(index)}
                            className="p-2 text-danger-600 hover:bg-danger-50 rounded shrink-0"
                            title="حذف"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {editingData.education.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">لا توجد سجلات تعليم</p>
                    )}
                  </div>
                </div>

                {/* Experience */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">الخبرة العملية</h3>
                    <button
                      onClick={addExperience}
                      className="btn btn-secondary text-sm py-1 px-3"
                    >
                      <PlusIcon className="w-4 h-4 inline ml-1" />
                      إضافة
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editingData.experience.map((exp, index) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={exp.title || ''}
                            onChange={(e) => updateExperience(index, 'title', e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="المسمى الوظيفي"
                          />
                          <input
                            type="text"
                            value={exp.company || ''}
                            onChange={(e) => updateExperience(index, 'company', e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="الشركة"
                          />
                          <button
                            onClick={() => removeExperience(index)}
                            className="p-2 text-danger-600 hover:bg-danger-50 rounded shrink-0"
                            title="حذف"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={exp.start_date || ''}
                            onChange={(e) => updateExperience(index, 'start_date', e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="تاريخ البداية"
                          />
                          <input
                            type="text"
                            value={exp.end_date || ''}
                            onChange={(e) => updateExperience(index, 'end_date', e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="تاريخ النهاية"
                          />
                        </div>
                      </div>
                    ))}
                    {editingData.experience.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">لا توجد سجلات خبرة</p>
                    )}
                  </div>
                </div>

                {/* Certificates */}
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-800">الشهادات والمؤهلات</h3>
                    <button
                      onClick={addCertificate}
                      className="btn btn-secondary text-sm py-1 px-3"
                    >
                      <PlusIcon className="w-4 h-4 inline ml-1" />
                      إضافة
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editingData.certificates.map((cert, index) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={cert.name || ''}
                              onChange={(e) => updateCertificate(index, 'name', e.target.value)}
                              className="input text-sm w-full"
                              placeholder="اسم الشهادة"
                            />
                            <input
                              type="text"
                              value={cert.issuer || ''}
                              onChange={(e) => updateCertificate(index, 'issuer', e.target.value)}
                              className="input text-sm w-full"
                              placeholder="المؤسسة المصدرة"
                            />
                            <input
                              type="text"
                              value={cert.date || ''}
                              onChange={(e) => updateCertificate(index, 'date', e.target.value)}
                              className="input text-sm w-32"
                              placeholder="التاريخ"
                            />
                          </div>
                          <button
                            onClick={() => removeCertificate(index)}
                            className="p-2 text-danger-600 hover:bg-danger-50 rounded shrink-0"
                            title="حذف"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {editingData.certificates.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">لا توجد شهادات</p>
                    )}
                  </div>
                </div>

                {/* Confirmed Skills */}
                <div className="card p-4">
                  <h3 className="font-semibold text-slate-800 mb-3">
                    المهارات المؤكدة ({selectedSkills.length} مختارة)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">مهارات مذكورة صراحة في السيرة الذاتية</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-3">
                    {previewData.suggestedSkills && previewData.suggestedSkills.length > 0 ? (
                      // Flatten all skills from all domains into a single list
                      previewData.suggestedSkills.flatMap(domainGroup => domainGroup.skills).map((skill) => (
                        <label
                          key={skill.skill_id}
                          className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSkills.includes(skill.skill_id)}
                            onChange={() => toggleSkill(skill.skill_id)}
                            className="w-4 h-4 text-primary-600 rounded"
                          />
                          <span className="text-sm text-slate-700">{skill.name_ar || skill.name_en}</span>
                          {skill.is_new && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                              جديد
                            </span>
                          )}
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">لم يتم استخراج مهارات مؤكدة</p>
                    )}
                  </div>
                </div>

                {/* Possible Skills */}
                {previewData.suggestedPossibleSkills && previewData.suggestedPossibleSkills.length > 0 && (
                  <div className="card p-4 border-2 border-amber-200 bg-amber-50/30">
                    <h3 className="font-semibold text-slate-800 mb-3">
                      المهارات المحتملة ({selectedPossibleSkills.length} مختارة)
                    </h3>
                    <p className="text-xs text-slate-600 mb-3">مهارات مستنتجة من السياق ولكن غير مذكورة صراحة</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto border border-amber-200 rounded-lg p-3 bg-white">
                      {/* Flatten all skills from all domains into a single list */}
                      {previewData.suggestedPossibleSkills.flatMap(domainGroup => domainGroup.skills).map((skill) => (
                        <label
                          key={skill.skill_id}
                          className="flex items-center gap-2 p-2 hover:bg-amber-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPossibleSkills.includes(skill.skill_id)}
                            onChange={() => togglePossibleSkill(skill.skill_id)}
                            className="w-4 h-4 text-amber-600 rounded"
                          />
                          <span className="text-sm text-slate-700">{skill.name_ar || skill.name_en}</span>
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                            محتمل
                          </span>
                          {skill.is_new && (
                            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                              جديد
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Success Stage */}
            {stage === STAGES.SUCCESS && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-12"
              >
                <CheckCircleIcon className="w-16 h-16 text-success-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-2">تم الاستيراد بنجاح!</h3>
                <p className="text-slate-500">تم حفظ بيانات السيرة الذاتية والمهارات</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {stage === STAGES.PREVIEW && (
          <div className="flex items-center justify-between p-6 border-t border-slate-200">
            <button
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={isProcessing}
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || (selectedSkills.length === 0 && selectedPossibleSkills.length === 0)}
              className="btn btn-primary"
            >
              {isProcessing ? 'جاري الحفظ...' : 'تأكيد الاستيراد'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

