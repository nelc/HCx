import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  ClockIcon,
  AcademicCapIcon,
  LinkIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api, { uploadCoursesCSV, syncCoursesToNeo4j } from '../utils/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({
    search: '',
    difficulty_level: '',
    skill_id: '',
  });
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    url: '',
    provider: '',
    duration_hours: '',
    difficulty_level: 'beginner',
    language: 'ar',
    subject: '',
    subtitle: '',
    university: '',
    skill_ids: [],
    skill_tags: [],
  });

  useEffect(() => {
    fetchCourses();
    fetchSkills();
  }, [filters, pagination.page]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.difficulty_level) params.append('difficulty_level', filters.difficulty_level);
      if (filters.skill_id) params.append('skill_id', filters.skill_id);
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);

      const response = await api.get(`/courses?${params.toString()}`);
      setCourses(response.data.courses || []);
      setPagination(prev => ({ ...prev, total: response.data.pagination.total }));
    } catch (error) {
      console.error('Fetch courses error:', error);
      toast.error('فشل في تحميل الدورات');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const response = await api.get('/skills');
      setSkills(response.data || []);
    } catch (error) {
      console.error('Fetch skills error:', error);
    }
  };

  const openCreateModal = () => {
    setEditingCourse(null);
    setForm({
      name_ar: '',
      name_en: '',
      description_ar: '',
      description_en: '',
      url: '',
      provider: '',
      duration_hours: '',
      difficulty_level: 'beginner',
      language: 'ar',
      subject: '',
      subtitle: '',
      university: '',
      skill_ids: [],
      skill_tags: [],
    });
    setShowModal(true);
  };

  const openEditModal = (course) => {
    setEditingCourse(course);
    setForm({
      name_ar: course.name_ar || '',
      name_en: course.name_en || '',
      description_ar: course.description_ar || '',
      description_en: course.description_en || '',
      url: course.url || '',
      provider: course.provider || '',
      duration_hours: course.duration_hours || '',
      difficulty_level: course.difficulty_level || 'beginner',
      language: course.language || 'ar',
      subject: course.subject || '',
      subtitle: course.subtitle || '',
      university: course.university || '',
      skill_ids: course.skills ? course.skills.map(s => s.id) : [],
      skill_tags: course.skill_tags || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const data = {
        ...form,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
      };

      if (editingCourse) {
        await api.patch(`/courses/${editingCourse.id}`, data);
        toast.success('تم تحديث الدورة بنجاح');
      } else {
        await api.post('/courses', data);
        toast.success('تم إنشاء الدورة بنجاح');
      }
      setShowModal(false);
      fetchCourses();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حفظ الدورة');
    }
  };

  const handleDelete = (course) => {
    setCourseToDelete(course);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!courseToDelete) return;
    
    try {
      await api.delete(`/courses/${courseToDelete.id}`);
      toast.success('تم حذف الدورة بنجاح');
      fetchCourses();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حذف الدورة');
    } finally {
      setShowDeleteModal(false);
      setCourseToDelete(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters({ ...filters, search: e.target.search.value });
    setPagination({ ...pagination, page: 1 });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/csv') {
      setUploadFile(file);
    } else {
      toast.error('الرجاء اختيار ملف CSV');
    }
  };

  const handleUploadCSV = async () => {
    if (!uploadFile) {
      toast.error('الرجاء اختيار ملف');
      return;
    }

    const startTime = Date.now();
    let estimatedTotal = 0;

    try {
      setUploadProgress({ 
        status: 'uploading', 
        message: 'جاري رفع الملف...', 
        percent: 0,
        phase: 'upload',
        startTime
      });
      
      const response = await uploadCoursesCSV(uploadFile, (progressData) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const estimated = progressData.percent > 0 
          ? Math.round((elapsed / progressData.percent) * (100 - progressData.percent))
          : 0;
          
        setUploadProgress({ 
          status: 'uploading', 
          message: 'جاري رفع الملف...', 
          percent: progressData.percent,
          phase: progressData.phase,
          estimatedTimeLeft: estimated,
          startTime
        });
      });
      
      // Calculate estimated processing time (rough estimate: 0.5 seconds per record)
      estimatedTotal = Math.ceil(response.data.total * 0.5);
      
      // After upload, show processing progress
      setUploadProgress({ 
        status: 'processing', 
        message: 'جاري معالجة الدورات...', 
        percent: 0,
        phase: 'processing',
        total: response.data.total,
        estimatedTimeLeft: estimatedTotal,
        startTime: Date.now()
      });
      
      // Simulate processing progress with time estimate
      let currentProgress = 0;
      const updateInterval = 100; // Update every 100ms
      const totalUpdates = (estimatedTotal * 1000) / updateInterval;
      const progressPerUpdate = 100 / totalUpdates;
      
      const progressInterval = setInterval(() => {
        currentProgress += progressPerUpdate;
        const remaining = Math.max(0, Math.ceil(estimatedTotal * (1 - currentProgress / 100)));
        
        if (currentProgress >= 100) {
          clearInterval(progressInterval);
          return;
        }
        
        setUploadProgress(prev => ({
          ...prev,
          percent: Math.min(Math.round(currentProgress), 99),
          estimatedTimeLeft: remaining
        }));
      }, updateInterval);
      
      // Wait for actual processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      clearInterval(progressInterval);
      
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      
      const insertedCount = response.data.inserted || 0;
      const updatedCount = response.data.updated || 0;
      
      let message = `تم رفع ${response.data.success} دورة بنجاح من أصل ${response.data.total}`;
      if (insertedCount > 0 && updatedCount > 0) {
        message = `تم إضافة ${insertedCount} دورة جديدة وتحديث ${updatedCount} دورة موجودة`;
      } else if (updatedCount > 0) {
        message = `تم تحديث ${updatedCount} دورة موجودة`;
      } else if (insertedCount > 0) {
        message = `تم إضافة ${insertedCount} دورة جديدة`;
      }
      
      setUploadProgress({ 
        status: 'completed', 
        message: message,
        details: response.data,
        percent: 100,
        totalTime
      });
      
      setUploadStats({
        success: response.data.success,
        inserted: insertedCount,
        updated: updatedCount,
        failed: response.data.failed,
        total: response.data.total,
        totalTime
      });
      
      if (response.data.failed > 0) {
        toast.error(`فشل رفع ${response.data.failed} دورة`);
      } else if (updatedCount > 0 && insertedCount === 0) {
        toast.success('تم تحديث جميع الدورات بنجاح');
      } else if (insertedCount > 0 && updatedCount === 0) {
        toast.success('تم إضافة جميع الدورات بنجاح');
      } else {
        toast.success('تمت العملية بنجاح');
      }
      
      fetchCourses();
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadProgress(null);
        setUploadStats(null);
      }, 5000);
    } catch (error) {
      setUploadProgress({ 
        status: 'error', 
        message: error.response?.data?.error || 'فشل في رفع الملف',
        percent: 0
      });
      toast.error('فشل في رفع الملف');
    }
  };

  const handleSyncToNeo4j = async () => {
    try {
      toast.loading('جاري المزامنة مع Neo4j...');
      const response = await syncCoursesToNeo4j();
      toast.dismiss();
      toast.success(`تمت مزامنة ${response.data.success} دورة من أصل ${response.data.total}`);
      fetchCourses();
    } catch (error) {
      toast.dismiss();
      toast.error(error.response?.data?.error || 'فشل في المزامنة');
    }
  };

  const getDifficultyLabel = (level) => {
    const labels = {
      beginner: 'مبتدئ',
      intermediate: 'متوسط',
      advanced: 'متقدم',
    };
    return labels[level] || level;
  };

  const getDifficultyColor = (level) => {
    const colors = {
      beginner: 'bg-green-100 text-green-700',
      intermediate: 'bg-yellow-100 text-yellow-700',
      advanced: 'bg-red-100 text-red-700',
    };
    return colors[level] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">إدارة الدورات التدريبية</h1>
          <p className="text-slate-500">إدارة الدورات ومزامنتها مع نظام التوصيات الذكي</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSyncToNeo4j}
            className="btn btn-secondary"
            title="مزامنة جميع الدورات مع Neo4j"
          >
            <ArrowPathIcon className="w-5 h-5" />
            مزامنة Neo4j
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            رفع CSV
          </button>
          <button onClick={openCreateModal} className="btn btn-primary">
            <PlusIcon className="w-5 h-5" />
            إضافة دورة
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              name="search"
              placeholder="ابحث عن دورة..."
              className="input pr-10 w-full"
              defaultValue={filters.search}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            بحث
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn btn-secondary"
          >
            <FunnelIcon className="w-5 h-5" />
          </button>
        </form>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="grid grid-cols-2 gap-4 pt-4 border-t"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                المستوى
              </label>
              <select
                value={filters.difficulty_level}
                onChange={(e) => setFilters({ ...filters, difficulty_level: e.target.value })}
                className="input w-full"
              >
                <option value="">الكل</option>
                <option value="beginner">مبتدئ</option>
                <option value="intermediate">متوسط</option>
                <option value="advanced">متقدم</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                المهارة
              </label>
              <select
                value={filters.skill_id}
                onChange={(e) => setFilters({ ...filters, skill_id: e.target.value })}
                className="input w-full"
              >
                <option value="">الكل</option>
                {skills.map(skill => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name_en || skill.name_ar}
                  </option>
                ))}
              </select>
            </div>
          </motion.div>
        )}
      </div>

      {/* Courses List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-3/4 mb-3"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="card p-12 text-center">
          <AcademicCapIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد دورات</h3>
          <p className="text-slate-500 mb-4">ابدأ بإضافة دورة أو رفع ملف CSV</p>
          <div className="flex gap-3 justify-center">
            <button onClick={openCreateModal} className="btn btn-primary inline-flex">
              <PlusIcon className="w-5 h-5" />
              إضافة دورة
            </button>
            <button onClick={() => setShowUploadModal(true)} className="btn btn-secondary inline-flex">
              <ArrowUpTrayIcon className="w-5 h-5" />
              رفع CSV
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {courses.map((course) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-800">
                        {course.name_ar}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getDifficultyColor(course.difficulty_level)}`}>
                        {getDifficultyLabel(course.difficulty_level)}
                      </span>
                      {course.synced_to_neo4j && (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3" />
                          متزامن
                        </span>
                      )}
                      {course.synced_to_neo4j === false && (
                        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded flex items-center gap-1">
                          <XCircleIcon className="w-3 h-3" />
                          غير متزامن
                        </span>
                      )}
                    </div>
                    
                    {course.description_ar && (
                      <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                        {course.description_ar}
                      </p>
                    )}

                    {course.subtitle && (
                      <p className="text-sm text-slate-500 mb-2 italic">
                        {course.subtitle}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                      {course.university && (
                        <div className="flex items-center gap-1">
                          <AcademicCapIcon className="w-4 h-4" />
                          <span>{course.university}</span>
                        </div>
                      )}
                      {course.subject && (
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                            {course.subject}
                          </span>
                        </div>
                      )}
                      {course.provider && (
                        <span>• {course.provider}</span>
                      )}
                      {course.duration_hours && (
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          <span>{course.duration_hours} ساعة</span>
                        </div>
                      )}
                      {course.url && (
                        <a
                          href={course.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                        >
                          <LinkIcon className="w-4 h-4" />
                          <span>رابط الدورة</span>
                        </a>
                      )}
                    </div>

                    {((course.skills && course.skills.length > 0) || (course.skill_tags && course.skill_tags.length > 0)) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(() => {
                          // Collect all domain skill names (English) to avoid duplicates
                          const domainSkillNames = new Set(
                            (course.skills || [])
                              .filter(skill => skill && skill.name_en)
                              .map(skill => skill.name_en.toLowerCase().trim())
                          );
                          
                          // Get unique skill tags that don't overlap with domain skills
                          const seen = new Set([...domainSkillNames]);
                          const uniqueTags = (course.skill_tags || []).filter(tag => {
                            const normalized = tag.toLowerCase().trim();
                            if (seen.has(normalized)) {
                              return false;
                            }
                            seen.add(normalized);
                            return true;
                          });
                          
                          return (
                            <>
                              {/* Domain skills (from skills table) - show only English name */}
                              {course.skills && course.skills.map(skill => skill && skill.name_en && (
                                <span
                                  key={skill.id}
                                  className="px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded"
                                  title="مهارة مطلوبة"
                                >
                                  {skill.name_en}
                                </span>
                              ))}
                              
                              {/* Skill tags (from CSV) - only show tags not already in domain skills */}
                              {uniqueTags.map((tag, idx) => (
                                <span
                                  key={`tag-${idx}`}
                                  className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded border border-slate-300"
                                  title="مهارة إضافية"
                                >
                                  {tag}
                                </span>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mr-4">
                    <button
                      onClick={() => openEditModal(course)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="تعديل"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(course)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPagination({ ...pagination, page: Math.max(1, pagination.page - 1) })}
                disabled={pagination.page === 1}
                className="btn btn-secondary disabled:opacity-50"
              >
                السابق
              </button>
              <span className="px-4 py-2 text-slate-600">
                صفحة {pagination.page} من {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                onClick={() => setPagination({ ...pagination, page: Math.min(Math.ceil(pagination.total / pagination.limit), pagination.page + 1) })}
                disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                className="btn btn-secondary disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <Dialog.Title className="text-xl font-bold text-primary-700">
                {editingCourse ? 'تعديل الدورة' : 'إضافة دورة جديدة'}
              </Dialog.Title>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الاسم (عربي) *
                  </label>
                  <input
                    type="text"
                    value={form.name_ar}
                    onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الاسم (إنجليزي)
                  </label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الوصف (عربي)
                  </label>
                  <textarea
                    value={form.description_ar}
                    onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                    className="input w-full"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الوصف (إنجليزي)
                  </label>
                  <textarea
                    value={form.description_en}
                    onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                    className="input w-full"
                    rows={3}
                  />
                </div>
              </div>

              {/* URL and Provider */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    رابط الدورة
                  </label>
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    مقدم الدورة
                  </label>
                  <input
                    type="text"
                    value={form.provider}
                    onChange={(e) => setForm({ ...form, provider: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Subject, Subtitle, University */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الموضوع/التخصص
                  </label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="input w-full"
                    placeholder="مثال: علوم الحاسب"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    العنوان الفرعي
                  </label>
                  <input
                    type="text"
                    value={form.subtitle}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    className="input w-full"
                    placeholder="مثال: مقدمة شاملة للبرمجة"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الجامعة/المؤسسة
                  </label>
                  <input
                    type="text"
                    value={form.university}
                    onChange={(e) => setForm({ ...form, university: e.target.value })}
                    className="input w-full"
                    placeholder="مثال: جامعة ستانفورد"
                  />
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    الساعات المقدرة
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.duration_hours}
                    onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    المستوى *
                  </label>
                  <select
                    value={form.difficulty_level}
                    onChange={(e) => setForm({ ...form, difficulty_level: e.target.value })}
                    className="input w-full"
                    required
                  >
                    <option value="beginner">مبتدئ</option>
                    <option value="intermediate">متوسط</option>
                    <option value="advanced">متقدم</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    اللغة
                  </label>
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="input w-full"
                  >
                    <option value="ar">عربي</option>
                    <option value="en">إنجليزي</option>
                    <option value="both">ثنائي اللغة</option>
                  </select>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  المهارات المرتبطة (من المجالات)
                </label>
                <select
                  multiple
                  value={form.skill_ids}
                  onChange={(e) => setForm({ ...form, skill_ids: Array.from(e.target.selectedOptions, option => option.value) })}
                  className="input w-full"
                  size="5"
                >
                  {skills.map(skill => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name_en || skill.name_ar}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  اضغط Ctrl/Cmd لاختيار أكثر من مهارة
                </p>
              </div>

              {/* Skill Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  مهارات إضافية (وسوم)
                </label>
                <input
                  type="text"
                  value={form.skill_tags.join(', ')}
                  onChange={(e) => setForm({ ...form, skill_tags: e.target.value.split(',').map(s => s.trim()).filter(s => s) })}
                  className="input w-full"
                  placeholder="مثال: البرمجة, تحليل البيانات, التصميم"
                />
                <p className="text-xs text-slate-500 mt-1">
                  افصل المهارات بفاصلة (,) - هذه المهارات ستظهر كوسوم منفصلة
                </p>
                {form.skill_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.skill_tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded border border-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCourse ? 'تحديث' : 'إنشاء'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* CSV Upload Modal */}
      <Dialog open={showUploadModal} onClose={() => !uploadProgress && setShowUploadModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="p-6 border-b border-slate-100">
              <Dialog.Title className="text-xl font-bold text-primary-700">
                رفع ملف CSV للدورات
              </Dialog.Title>
            </div>

            <div className="p-6 space-y-6">
              {!uploadProgress ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      اختر ملف CSV
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="input w-full"
                    />
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-medium text-slate-800 mb-2">صيغة الملف المطلوبة:</h4>
                    <code className="text-xs bg-white p-2 rounded block overflow-x-auto">
                      name_ar,name_en,description_ar,url,provider,duration_hours,difficulty_level,language,subject,subtitle,university,skills
                    </code>
                    <p className="text-xs text-slate-500 mt-2">
                      • المهارات: افصلها بفاصلة (مثال: "البرمجة,تحليل البيانات")
                      <br />
                      • المستوى: beginner أو intermediate أو advanced
                      <br />
                      • الحقول الجديدة: subject (الموضوع), subtitle (العنوان الفرعي), university (الجامعة)
                      <br />
                      • يمكنك تحميل الملف النموذجي من: /backend/sample-courses.csv
                    </p>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(false)}
                      className="btn btn-secondary"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadCSV}
                      disabled={!uploadFile}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      <ArrowUpTrayIcon className="w-5 h-5" />
                      رفع الملف
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  {(uploadProgress.status === 'uploading' || uploadProgress.status === 'processing') && (
                    <div className="space-y-4">
                      <ArrowUpTrayIcon className="w-16 h-16 text-primary-600 mx-auto mb-4 animate-bounce" />
                      <p className="text-lg font-medium text-slate-800">{uploadProgress.message}</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full max-w-md mx-auto">
                        <div className="flex justify-between text-sm text-slate-600 mb-2">
                          <span className="font-semibold">{uploadProgress.percent}%</span>
                          {uploadProgress.estimatedTimeLeft !== undefined && uploadProgress.estimatedTimeLeft > 0 && (
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-4 h-4" />
                              الوقت المتبقي: {uploadProgress.estimatedTimeLeft} ثانية
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="bg-gradient-to-r from-primary-500 to-primary-600 h-full rounded-full shadow-sm"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress.percent}%` }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                          />
                        </div>
                        
                        {/* Status Messages */}
                        <div className="mt-4 text-sm text-slate-500">
                          {uploadProgress.status === 'uploading' && (
                            <div className="space-y-1">
                              <p className="font-medium text-slate-700">⬆️ جاري رفع الملف إلى السيرفر...</p>
                              {uploadProgress.phase === 'upload' && (
                                <p className="text-xs">يتم نقل الملف من جهازك إلى السيرفر</p>
                              )}
                            </div>
                          )}
                          {uploadProgress.status === 'processing' && (
                            <div className="space-y-1">
                              <p className="font-medium text-slate-700">⚙️ جاري معالجة البيانات وحفظها...</p>
                              {uploadProgress.total && (
                                <p className="text-xs">معالجة {uploadProgress.total} دورة وحفظها في قاعدة البيانات</p>
                              )}
                              <p className="text-xs text-slate-400">يتم المزامنة مع Neo4j تلقائياً</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {uploadProgress.status === 'completed' && (
                    <div>
                      <CheckCircleIcon className="w-16 h-16 text-green-600 mx-auto mb-4" />
                      <p className="text-lg font-medium text-slate-800 mb-4">{uploadProgress.message}</p>
                      
                      {/* Progress Bar at 100% */}
                      <div className="w-full max-w-md mx-auto mb-4">
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full w-full" />
                        </div>
                      </div>
                      
                      {uploadProgress.details && (
                        <div className="bg-slate-50 rounded-lg p-4 text-right max-w-md mx-auto">
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div className="bg-green-100 text-green-700 px-3 py-2 rounded">
                              <div className="font-bold text-2xl">{uploadProgress.details.success}</div>
                              <div className="text-xs">✅ نجح</div>
                            </div>
                            <div className="bg-red-100 text-red-700 px-3 py-2 rounded">
                              <div className="font-bold text-2xl">{uploadProgress.details.failed}</div>
                              <div className="text-xs">❌ فشل</div>
                            </div>
                          </div>
                          {(uploadProgress.details.inserted > 0 || uploadProgress.details.updated > 0) && (
                            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                              <div className="bg-blue-100 text-blue-700 px-3 py-2 rounded">
                                <div className="font-bold text-xl">{uploadProgress.details.inserted || 0}</div>
                                <div className="text-xs">➕ جديد</div>
                              </div>
                              <div className="bg-amber-100 text-amber-700 px-3 py-2 rounded">
                                <div className="font-bold text-xl">{uploadProgress.details.updated || 0}</div>
                                <div className="text-xs">🔄 محدّث</div>
                              </div>
                            </div>
                          )}
                          <div className="pt-3 border-t border-slate-200">
                            <p className="text-sm text-slate-600">
                              📊 المجموع: {uploadProgress.details.total}
                              {uploadProgress.totalTime && (
                                <>
                                  <br />
                                  ⏱️ الوقت المستغرق: {uploadProgress.totalTime} ثانية
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {uploadProgress.status === 'error' && (
                    <div>
                      <XCircleIcon className="w-16 h-16 text-red-600 mx-auto mb-4" />
                      <p className="text-lg font-medium text-slate-800 mb-2">{uploadProgress.message}</p>
                      <p className="text-sm text-slate-500 mb-4">يرجى المحاولة مرة أخرى</p>
                      <button
                        onClick={() => {
                          setUploadProgress(null);
                          setUploadFile(null);
                          setUploadStats(null);
                        }}
                        className="btn btn-primary mt-4"
                      >
                        إعادة المحاولة
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="حذف الدورة"
        message={`هل أنت متأكد من حذف الدورة "${courseToDelete?.name_ar}"؟ سيتم حذفها من قاعدة البيانات ومن Neo4j.`}
      />
    </div>
  );
}
