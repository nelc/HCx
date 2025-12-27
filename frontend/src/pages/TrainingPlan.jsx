import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AcademicCapIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
  PlayIcon,
  FolderIcon,
  SparklesIcon,
  LinkIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
  DocumentArrowUpIcon,
  CloudArrowDownIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import api, { downloadFile } from '../utils/api';

export default function TrainingPlan() {
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState(null);
  const [plan, setPlan] = useState(null);
  const [expandedDomains, setExpandedDomains] = useState({});
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [activeTab, setActiveTab] = useState('recommended'); // 'recommended' or 'external'
  const [recommendedCourses, setRecommendedCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  
  // External course form
  const [externalForm, setExternalForm] = useState({
    title: '',
    url: '',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [addingCourseId, setAddingCourseId] = useState(null);
  
  // Certificate upload modal states
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [selectedPlanItem, setSelectedPlanItem] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificateNotes, setCertificateNotes] = useState('');
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const fileInputRef = useRef(null);
  
  // Neo4j progress states
  const [neo4jProgress, setNeo4jProgress] = useState(null);
  const [loadingNeo4jProgress, setLoadingNeo4jProgress] = useState(false);
  const [autoCompletingId, setAutoCompletingId] = useState(null);
  
  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reqRes, planRes] = await Promise.all([
        api.get('/training-plans/my-requirements'),
        api.get('/training-plans/my-plan')
      ]);
      setRequirements(reqRes.data);
      setPlan(planRes.data);
      
      // Keep all domains collapsed by default
      setExpandedDomains({});
      
      // Fetch Neo4j progress in the background
      fetchNeo4jProgress();
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const fetchNeo4jProgress = async () => {
    setLoadingNeo4jProgress(true);
    try {
      const res = await api.get('/training-plans/neo4j-progress');
      setNeo4jProgress(res.data);
    } catch (error) {
      console.error('Failed to fetch Neo4j progress:', error);
      // Silent fail - Neo4j progress is optional
    } finally {
      setLoadingNeo4jProgress(false);
    }
  };

  const toggleDomain = (domainId) => {
    setExpandedDomains(prev => ({
      ...prev,
      [domainId]: !prev[domainId]
    }));
  };

  const getSkillPlanItems = (skillId) => {
    if (!plan?.raw_items) return [];
    return plan.raw_items.filter(item => item.skill_id === skillId);
  };

  const getSkillStats = (skillId) => {
    const items = getSkillPlanItems(skillId);
    return {
      total: items.length,
      completed: items.filter(i => i.status === 'completed').length,
      in_progress: items.filter(i => i.status === 'in_progress').length,
      pending: items.filter(i => i.status === 'pending').length
    };
  };

  const openAddModal = async (skill) => {
    setSelectedSkill(skill);
    setShowAddModal(true);
    setActiveTab('recommended');
    setExternalForm({ title: '', url: '', description: '' });
    
    // Fetch recommended courses for this skill
    setLoadingCourses(true);
    try {
      const res = await api.get(`/training-plans/skill/${skill.id}/recommended-courses`);
      setRecommendedCourses(res.data.courses || []);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      setRecommendedCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedSkill(null);
    setRecommendedCourses([]);
    setExternalForm({ title: '', url: '', description: '' });
    setCourseSearchQuery('');
    setAddingCourseId(null);
  };

  const handleAddRecommendedCourse = async (course) => {
    if (!selectedSkill) return;
    
    setAddingCourseId(course.id);
    try {
      await api.post('/training-plans', {
        skill_id: selectedSkill.id,
        plan_type: 'recommended',
        course_id: course.id
      });
      toast.success('تمت إضافة الدورة إلى خطتك');
      fetchData();
      closeAddModal();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في إضافة الدورة');
    } finally {
      setAddingCourseId(null);
    }
  };

  const handleAddExternalCourse = async (e) => {
    e.preventDefault();
    if (!selectedSkill || !externalForm.title.trim()) {
      toast.error('اسم الدورة مطلوب');
      return;
    }
    
    setSubmitting(true);
    try {
      await api.post('/training-plans', {
        skill_id: selectedSkill.id,
        plan_type: 'external',
        external_course_title: externalForm.title.trim(),
        external_course_url: externalForm.url.trim() || null,
        external_course_description: externalForm.description.trim() || null
      });
      toast.success('تمت إضافة الدورة الخارجية إلى خطتك');
      fetchData();
      closeAddModal();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في إضافة الدورة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (itemId, newStatus) => {
    try {
      await api.put(`/training-plans/${itemId}`, { status: newStatus });
      toast.success('تم تحديث الحالة');
      fetchData();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  // Open certificate modal when completing a course
  const handleCompleteClick = (item) => {
    // Check if this is a recommended course with Neo4j completion
    const neo4jItem = neo4jProgress?.progress?.find(p => p.plan_item_id === item.id);
    
    if (neo4jItem?.can_auto_complete) {
      // Offer auto-complete option
      setSelectedPlanItem({ ...item, neo4jData: neo4jItem });
    } else {
      setSelectedPlanItem(item);
    }
    
    setCertificateFile(null);
    setCertificateNotes('');
    setShowCertificateModal(true);
  };

  const closeCertificateModal = () => {
    setShowCertificateModal(false);
    setSelectedPlanItem(null);
    setCertificateFile(null);
    setCertificateNotes('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('نوع الملف غير مدعوم. يرجى رفع PDF أو صورة');
        return;
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت');
        return;
      }
      setCertificateFile(file);
    }
  };

  const handleUploadCertificate = async (e) => {
    e.preventDefault();
    if (!selectedPlanItem || !certificateFile) {
      toast.error('يرجى اختيار ملف الشهادة');
      return;
    }

    setUploadingCertificate(true);
    try {
      const formData = new FormData();
      formData.append('certificate', certificateFile);
      if (certificateNotes) {
        formData.append('notes', certificateNotes);
      }

      await api.post(`/training-plans/${selectedPlanItem.id}/complete-with-certificate`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('تم إكمال الدورة بنجاح');
      closeCertificateModal();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في رفع الشهادة');
    } finally {
      setUploadingCertificate(false);
    }
  };

  const handleAutoCompleteFromNeo4j = async () => {
    if (!selectedPlanItem) return;

    setAutoCompletingId(selectedPlanItem.id);
    try {
      await api.post(`/training-plans/${selectedPlanItem.id}/auto-complete-from-neo4j`);
      toast.success('تم إكمال الدورة تلقائياً من سجلات NELC');
      closeCertificateModal();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في الإكمال التلقائي');
    } finally {
      setAutoCompletingId(null);
    }
  };

  // Get Neo4j progress for a specific plan item
  const getNeo4jProgressForItem = (itemId) => {
    return neo4jProgress?.progress?.find(p => p.plan_item_id === itemId);
  };

  const openDeleteModal = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      await api.delete(`/training-plans/${itemToDelete.id}`);
      toast.success('تم حذف الدورة من الخطة');
      closeDeleteModal();
      fetchData();
    } catch (error) {
      toast.error('فشل في حذف الدورة');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-success-100 text-success-700 rounded-full text-xs font-medium">
            <CheckCircleSolidIcon className="w-3 h-3" />
            مكتمل
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <PlayIcon className="w-3 h-3" />
            قيد التنفيذ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
            <ClockIcon className="w-3 h-3" />
            معلق
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري تحميل خطة التدريب...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-2">خطة التدريب</h1>
          <p className="text-slate-500">
            {requirements?.department?.name_ar 
              ? `المهارات المطلوبة لـ ${requirements.department.name_ar}`
              : 'قم ببناء خطتك التدريبية لتطوير مهاراتك'
            }
          </p>
          {requirements?.hierarchy?.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              التسلسل الوظيفي: {requirements.hierarchy.join(' ← ')}
            </p>
          )}
        </div>
        {requirements?.total_domains > 0 && (
          <div className="bg-primary-50 text-primary-700 px-4 py-2 rounded-xl">
            <span className="font-bold">{requirements.total_domains}</span> مجال تدريبي • <span className="font-bold">{requirements.total_skills}</span> مهارة مطلوبة
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {plan?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <BookOpenIcon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-700">{plan.stats.total_courses}</p>
                <p className="text-xs text-slate-500">إجمالي الدورات</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success-100 rounded-xl flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success-700">{plan.stats.completed}</p>
                <p className="text-xs text-slate-500">مكتملة</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <PlayIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{plan.stats.in_progress}</p>
                <p className="text-xs text-slate-500">قيد التنفيذ</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-700">{plan.stats.pending}</p>
                <p className="text-xs text-slate-500">معلقة</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* No Department Message */}
      {!requirements?.department && (
        <div className="card p-12 text-center">
          <ExclamationCircleIcon className="w-16 h-16 text-warning-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">لم يتم تحديد القسم</h3>
          <p className="text-slate-500">يرجى التواصل مع المسؤول لتحديد القسم الخاص بك لعرض المهارات المطلوبة</p>
        </div>
      )}

      {/* Domains and Skills */}
      {requirements?.domains?.length > 0 ? (
        <div className="space-y-4">
          {requirements.domains.map((domain, domainIndex) => (
            <motion.div
              key={domain.domain_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: domainIndex * 0.1 }}
              className="card overflow-hidden"
            >
              {/* Domain Header */}
              <button
                onClick={() => toggleDomain(domain.domain_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: (domain.domain_color || '#502390') + '20' }}
                  >
                    <FolderIcon
                      className="w-6 h-6"
                      style={{ color: domain.domain_color || '#502390' }}
                    />
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-slate-800">{domain.domain_name_ar}</h3>
                    <p className="text-sm text-slate-500">
                      {domain.skills?.length || 0} مهارة
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Skills with courses selected vs total required skills */}
                  {(() => {
                    const skillsWithCourses = domain.skills?.filter(s => getSkillStats(s.id).total > 0).length || 0;
                    const totalSkills = domain.skills?.length || 0;
                    const completedCourses = domain.skills?.reduce((sum, s) => sum + getSkillStats(s.id).completed, 0) || 0;
                    const totalCourses = domain.skills?.reduce((sum, s) => sum + getSkillStats(s.id).total, 0) || 0;
                    return (
                      <div className="flex items-center gap-2">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: skillsWithCourses === totalSkills && totalSkills > 0 
                              ? '#dcfce7' 
                              : (domain.domain_color || '#502390') + '20',
                            color: skillsWithCourses === totalSkills && totalSkills > 0 
                              ? '#166534' 
                              : domain.domain_color || '#502390'
                          }}
                        >
                          {skillsWithCourses}/{totalSkills} مهارة
                        </span>
                        {totalCourses > 0 && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            {completedCourses}/{totalCourses} دورة
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {expandedDomains[domain.domain_id] ? (
                    <ChevronUpIcon className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Skills List */}
              <AnimatePresence>
                {expandedDomains[domain.domain_id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-100"
                  >
                    <div className="p-4 space-y-4">
                      {domain.skills?.map((skill) => {
                        const planItems = getSkillPlanItems(skill.id);
                        const stats = getSkillStats(skill.id);
                        
                        return (
                          <div
                            key={skill.id}
                            className={`border rounded-xl p-4 ${
                              stats.total > 0 
                                ? stats.completed > 0 
                                  ? 'border-success-200 bg-success-50/30' 
                                  : 'border-blue-200 bg-blue-50/30'
                                : 'border-warning-200 bg-warning-50/30'
                            }`}
                          >
                            {/* Skill Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-start gap-3">
                                <div className={`w-2 h-2 rounded-full mt-2 ${
                                  stats.total > 0 
                                    ? stats.completed > 0 
                                      ? 'bg-success-500' 
                                      : 'bg-blue-500'
                                    : 'bg-warning-500'
                                }`} title={stats.total === 0 ? 'لم تتم إضافة دورات' : stats.completed > 0 ? 'يوجد دورات مكتملة' : 'يوجد دورات قيد التقدم'} />
                                <div>
                                  <h4 className="font-semibold text-slate-800">{skill.name_ar}</h4>
                                  {skill.name_en && (
                                    <p className="text-sm text-slate-500">{skill.name_en}</p>
                                  )}
                                  {stats.total === 0 && (
                                    <p className="text-xs text-warning-600 mt-1">⚠️ لم تتم إضافة دورات لهذه المهارة</p>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => openAddModal(skill)}
                                className="btn btn-primary btn-sm"
                              >
                                <PlusIcon className="w-4 h-4" />
                                إضافة دورة
                              </button>
                            </div>

                            {/* Skill Description */}
                            {skill.description_ar && (
                              <p className="text-sm text-slate-600 mb-3">{skill.description_ar}</p>
                            )}

                            {/* Plan Items for this Skill */}
                            {planItems.length > 0 ? (
                              <div className="space-y-2">
                                {planItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className={`p-3 rounded-lg border ${
                                      item.status === 'completed'
                                        ? 'bg-success-50 border-success-200'
                                        : item.status === 'in_progress'
                                        ? 'bg-blue-50 border-blue-200'
                                        : 'bg-slate-50 border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-3 flex-1">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                          item.plan_type === 'external' 
                                            ? 'bg-purple-100' 
                                            : 'bg-primary-100'
                                        }`}>
                                          {item.plan_type === 'external' ? (
                                            <LinkIcon className="w-4 h-4 text-purple-600" />
                                          ) : (
                                            <AcademicCapIcon className="w-4 h-4 text-primary-600" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h5 className="font-medium text-slate-800">
                                              {item.plan_type === 'external'
                                                ? item.external_course_title
                                                : item.course_name_ar
                                              }
                                            </h5>
                                            {getStatusBadge(item.status)}
                                          </div>
                                          
                                          {item.plan_type === 'external' && item.external_course_description && (
                                            <p className="text-xs text-slate-500 mt-1">
                                              {item.external_course_description}
                                            </p>
                                          )}
                                          
                                          <div className="flex items-center gap-3 mt-2">
                                            {item.plan_type === 'external' ? (
                                              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                                دورة خارجية
                                              </span>
                                            ) : (
                                              <>
                                                {item.course_provider && (
                                                  <span className="text-xs text-slate-500">
                                                    {item.course_provider}
                                                  </span>
                                                )}
                                                {item.course_duration && (
                                                  <span className="text-xs text-slate-500 flex items-center gap-1">
                                                    <ClockIcon className="w-3 h-3" />
                                                    {item.course_duration} ساعة
                                                  </span>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-1 shrink-0">
                                        {/* Neo4j sync indicator for recommended courses */}
                                        {item.plan_type === 'recommended' && (() => {
                                          const neo4jItem = getNeo4jProgressForItem(item.id);
                                          if (neo4jItem?.is_completed_in_neo4j && item.status !== 'completed') {
                                            return (
                                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1" title="مكتمل في NELC">
                                                <CloudArrowDownIcon className="w-3 h-3" />
                                                NELC
                                              </span>
                                            );
                                          }
                                          return null;
                                        })()}
                                        
                                        {/* Certificate download button for completed courses */}
                                        {item.status === 'completed' && item.certificate_id && (
                                          <button
                                            onClick={async () => {
                                              try {
                                                await downloadFile(
                                                  `/recommendations/certificate/${item.certificate_id}/download`,
                                                  item.certificate_original_filename || 'certificate'
                                                );
                                                toast.success('تم تحميل الشهادة');
                                              } catch (error) {
                                                toast.error('فشل في تحميل الشهادة');
                                              }
                                            }}
                                            className="p-2 text-success-600 hover:text-success-700 hover:bg-success-50 rounded-lg transition-colors flex items-center gap-1"
                                            title={`تحميل الشهادة: ${item.certificate_original_filename || 'شهادة'}`}
                                          >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                          </button>
                                        )}
                                        
                                        {/* Status Actions - Show both icons for non-completed courses */}
                                        {item.status !== 'completed' && (
                                          <>
                                            {/* In Progress icon - only show if not already in_progress */}
                                            {item.status !== 'in_progress' && (
                                              <button
                                                onClick={() => handleUpdateStatus(item.id, 'in_progress')}
                                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                title="قيد التنفيذ"
                                              >
                                                <PlayIcon className="w-4 h-4" />
                                              </button>
                                            )}
                                            {/* Complete icon - always available for non-completed */}
                                            <button
                                              onClick={() => handleCompleteClick(item)}
                                              className="p-2 text-success-600 hover:bg-success-100 rounded-lg transition-colors"
                                              title="مكتمل"
                                            >
                                              <CheckCircleIcon className="w-4 h-4" />
                                            </button>
                                          </>
                                        )}
                                        
                                        {/* External Link */}
                                        {(item.course_url || item.external_course_url) && (
                                          <a
                                            href={item.course_url || item.external_course_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                            title="فتح الدورة"
                                          >
                                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                          </a>
                                        )}
                                        
                                        {/* Delete */}
                                        <button
                                          onClick={() => openDeleteModal(item)}
                                          className="p-2 text-slate-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                                          title="حذف من الخطة"
                                        >
                                          <TrashIcon className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-4 bg-slate-50 rounded-lg text-center">
                                <BookOpenIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">لم تتم إضافة دورات لهذه المهارة</p>
                                <button
                                  onClick={() => openAddModal(skill)}
                                  className="text-primary-600 text-sm font-medium hover:underline mt-1"
                                >
                                  أضف دورة الآن
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      ) : requirements?.department && (
        <div className="card p-12 text-center">
          <FolderIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">لا توجد مجالات تدريبية</h3>
          <p className="text-slate-500">لم يتم ربط أي مجالات تدريبية بقسمك حتى الآن</p>
        </div>
      )}

      {/* Add Course Modal */}
      <AnimatePresence>
        {showAddModal && selectedSkill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeAddModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-primary-700">إضافة دورة</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      المهارة: {selectedSkill.name_ar}
                    </p>
                  </div>
                  <button
                    onClick={closeAddModal}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setActiveTab('recommended')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'recommended'
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <SparklesIcon className="w-4 h-4" />
                    الدورات المقترحة
                  </button>
                  <button
                    onClick={() => setActiveTab('external')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeTab === 'external'
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4" />
                    دورة خارجية
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
                {activeTab === 'recommended' ? (
                  <div>
                    {loadingCourses ? (
                      <div className="py-12 text-center">
                        <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-slate-500">جاري تحميل الدورات المقترحة...</p>
                      </div>
                    ) : recommendedCourses.length > 0 ? (
                      <div className="space-y-3">
                        {/* Search Bar */}
                        <div className="relative mb-4">
                          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input
                            type="text"
                            value={courseSearchQuery}
                            onChange={(e) => setCourseSearchQuery(e.target.value)}
                            placeholder="البحث عن دورة..."
                            className="input pr-10 text-sm"
                          />
                        </div>
                        
                        {/* Filtered Courses */}
                        {(() => {
                          const filteredCourses = recommendedCourses.filter(course => {
                            if (!courseSearchQuery.trim()) return true;
                            const query = courseSearchQuery.toLowerCase().trim();
                            return (
                              course.name_ar?.toLowerCase().includes(query) ||
                              course.name_en?.toLowerCase().includes(query) ||
                              course.description_ar?.toLowerCase().includes(query) ||
                              course.provider?.toLowerCase().includes(query)
                            );
                          });
                          
                          if (filteredCourses.length === 0) {
                            return (
                              <div className="py-8 text-center">
                                <MagnifyingGlassIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-slate-500">لا توجد نتائج لـ "{courseSearchQuery}"</p>
                                <button
                                  onClick={() => setCourseSearchQuery('')}
                                  className="text-primary-600 text-sm font-medium hover:underline mt-2"
                                >
                                  مسح البحث
                                </button>
                              </div>
                            );
                          }
                          
                          return filteredCourses.map((course) => (
                          <div
                            key={course.id}
                            className="p-4 border border-slate-200 rounded-xl hover:border-primary-300 hover:bg-primary-50/30 transition-all"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <h4 className="font-semibold text-slate-800">{course.name_ar}</h4>
                                {course.name_en && (
                                  <p className="text-sm text-slate-500">{course.name_en}</p>
                                )}
                                {course.description_ar && (
                                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                                    {course.description_ar}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  {course.provider && (
                                    <span className="text-xs text-slate-500">{course.provider}</span>
                                  )}
                                  {course.duration_hours && (
                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                      <ClockIcon className="w-3 h-3" />
                                      {course.duration_hours} ساعة
                                    </span>
                                  )}
                                  {course.difficulty_level && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      course.difficulty_level === 'beginner' 
                                        ? 'bg-green-100 text-green-700'
                                        : course.difficulty_level === 'intermediate'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                      {course.difficulty_level === 'beginner' ? 'مبتدئ' :
                                       course.difficulty_level === 'intermediate' ? 'متوسط' : 'متقدم'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleAddRecommendedCourse(course)}
                                disabled={addingCourseId !== null}
                                className="btn btn-primary btn-sm shrink-0"
                              >
                                {addingCourseId === course.id ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                  <>
                                    <PlusIcon className="w-4 h-4" />
                                    إضافة
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ));
                        })()}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <BookOpenIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">لا توجد دورات مقترحة لهذه المهارة</p>
                        <button
                          onClick={() => setActiveTab('external')}
                          className="text-primary-600 font-medium hover:underline mt-2"
                        >
                          أضف دورة خارجية بدلاً من ذلك
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleAddExternalCourse} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        اسم الدورة <span className="text-danger-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={externalForm.title}
                        onChange={(e) => setExternalForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="مثال: دورة إدارة المشاريع الاحترافية"
                        className="input"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        رابط الدورة <span className="text-slate-400">(اختياري)</span>
                      </label>
                      <input
                        type="url"
                        value={externalForm.url}
                        onChange={(e) => setExternalForm(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://example.com/course"
                        className="input"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        وصف الدورة <span className="text-slate-400">(اختياري)</span>
                      </label>
                      <textarea
                        value={externalForm.description}
                        onChange={(e) => setExternalForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="وصف مختصر للدورة..."
                        className="input resize-none"
                        rows={3}
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={closeAddModal}
                        className="btn btn-secondary flex-1"
                        disabled={submitting}
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary flex-1"
                        disabled={submitting || !externalForm.title.trim()}
                      >
                        {submitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            جاري الإضافة...
                          </>
                        ) : (
                          <>
                            <PlusIcon className="w-5 h-5" />
                            إضافة الدورة
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Certificate Upload Modal */}
      <AnimatePresence>
        {showCertificateModal && selectedPlanItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeCertificateModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-primary-700">إكمال الدورة</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedPlanItem.plan_type === 'external'
                        ? selectedPlanItem.external_course_title
                        : selectedPlanItem.course_name_ar
                      }
                    </p>
                  </div>
                  <button
                    onClick={closeCertificateModal}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {/* Auto-complete option for Neo4j courses */}
                {selectedPlanItem.neo4jData?.can_auto_complete && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                        <CloudArrowDownIcon className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-green-800">مكتمل في نظام NELC</h4>
                        <p className="text-sm text-green-700 mt-1">
                          تم العثور على سجل إكمال لهذه الدورة في نظام NELC. يمكنك الإكمال التلقائي.
                        </p>
                        <button
                          onClick={handleAutoCompleteFromNeo4j}
                          disabled={autoCompletingId === selectedPlanItem.id}
                          className="btn btn-sm mt-3 bg-green-600 hover:bg-green-700 text-white"
                        >
                          {autoCompletingId === selectedPlanItem.id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              جاري الإكمال...
                            </>
                          ) : (
                            <>
                              <CheckCircleSolidIcon className="w-4 h-4" />
                              إكمال تلقائي من NELC
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Divider if both options available */}
                {selectedPlanItem.neo4jData?.can_auto_complete && (
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-px bg-slate-200"></div>
                    <span className="text-sm text-slate-500">أو</span>
                    <div className="flex-1 h-px bg-slate-200"></div>
                  </div>
                )}

                {/* Manual upload form */}
                <form onSubmit={handleUploadCertificate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      رفع الشهادة أو إثبات الإكمال <span className="text-danger-500">*</span>
                    </label>
                    <p className="text-xs text-slate-500 mb-3">
                      يرجى رفع شهادة إكمال الدورة أو أي إثبات آخر (PDF أو صورة)
                    </p>
                    
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        certificateFile
                          ? 'border-success-300 bg-success-50'
                          : 'border-slate-300 hover:border-primary-400 hover:bg-primary-50/30'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      
                      {certificateFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <DocumentArrowUpIcon className="w-8 h-8 text-success-600" />
                          <div className="text-right">
                            <p className="font-medium text-success-700">{certificateFile.name}</p>
                            <p className="text-xs text-success-600">
                              {(certificateFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <ArrowUpTrayIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                          <p className="text-slate-600 font-medium">اضغط لاختيار ملف</p>
                          <p className="text-xs text-slate-500 mt-1">PDF, JPG, PNG (الحد الأقصى 10MB)</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ملاحظات <span className="text-slate-400">(اختياري)</span>
                    </label>
                    <textarea
                      value={certificateNotes}
                      onChange={(e) => setCertificateNotes(e.target.value)}
                      placeholder="أي ملاحظات إضافية..."
                      className="input resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={closeCertificateModal}
                      className="btn btn-secondary flex-1"
                      disabled={uploadingCertificate}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary flex-1"
                      disabled={uploadingCertificate || !certificateFile}
                    >
                      {uploadingCertificate ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          جاري الرفع...
                        </>
                      ) : (
                        <>
                          <CheckCircleSolidIcon className="w-5 h-5" />
                          إكمال الدورة
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && itemToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeDeleteModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrashIcon className="w-8 h-8 text-danger-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">حذف الدورة</h3>
                <p className="text-slate-600 mb-6">
                  هل أنت متأكد من حذف هذه الدورة من خطتك؟
                </p>
                <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 mb-6">
                  {itemToDelete.plan_type === 'external'
                    ? itemToDelete.external_course_title
                    : itemToDelete.course_name_ar
                  }
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={closeDeleteModal}
                    className="btn btn-secondary flex-1"
                    disabled={deleting}
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="btn flex-1 bg-danger-600 hover:bg-danger-700 text-white"
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        جاري الحذف...
                      </>
                    ) : (
                      <>
                        <TrashIcon className="w-5 h-5" />
                        حذف
                      </>
                    )}
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

