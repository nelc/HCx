import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ClockIcon,
  AcademicCapIcon,
  LinkIcon,
  XCircleIcon,
  StarIcon,
  SparklesIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import EditCourseModal from '../components/EditCourseModal';
import AddCourseModal from '../components/AddCourseModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function Courses() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
  const [courses, setCourses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [sourceError, setSourceError] = useState(null);
  const [neo4jFilters, setNeo4jFilters] = useState(null); // Filter options from Neo4j
  const [enrichingCourseId, setEnrichingCourseId] = useState(null); // Track which course is being enriched
  const [removingItem, setRemovingItem] = useState(null); // Track item being removed {courseId, type, value}
  const [filters, setFilters] = useState({
    search: '',
    difficulty_level: '',
    skill_id: '',
    university: '',
    subject: '',
    visibility: '', // '' = all, 'visible' = visible only, 'hidden' = hidden only
  });
  
  // Admin edit/delete/add modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState({}); // Track expanded descriptions
  const [togglingHidden, setTogglingHidden] = useState(null); // Track course being hidden/unhidden

  useEffect(() => {
    fetchNeo4jCourses();
    fetchSkills();
  }, [filters, pagination.page]);

  // Fetch Neo4j filter options on mount
  useEffect(() => {
    if (!neo4jFilters) {
      fetchNeo4jFilters();
    }
  }, []);

  const fetchNeo4jCourses = async () => {
    try {
      setLoading(true);
      setSourceError(null);
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.difficulty_level) params.append('difficulty_level', filters.difficulty_level);
      if (filters.skill_id) params.append('skill', filters.skill_id);
      if (filters.university) params.append('university', filters.university);
      if (filters.subject) params.append('subject', filters.subject);
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);
      params.append('is_prod', 'false'); // Add is_prod=false parameter

      // Fetch both Neo4j courses and locally added courses in parallel
      const [neo4jResponse, localResponse] = await Promise.allSettled([
        api.get(`/courses/neo4j?${params.toString()}`),
        api.get(`/courses?${params.toString()}`) // Fetch locally added courses from PostgreSQL
      ]);

      let allCourses = [];
      let totalCount = 0;

      // Add locally added courses first (on top)
      // Only include courses that are NOT synced to Neo4j (truly local/manual courses)
      // Courses synced to Neo4j will come from the /neo4j endpoint
      if (localResponse.status === 'fulfilled' && localResponse.value?.data?.courses) {
        const localCourses = localResponse.value.data.courses
          .filter(c => !c.synced_to_neo4j) // Only include truly local courses
          .map(c => ({
            ...c,
            source: 'local',
            is_local: true,
            is_visible: c.is_visible !== undefined ? c.is_visible : true // Default to visible for local courses
          }));
        allCourses = [...localCourses];
        totalCount += localCourses.length;
      }

      // Add Neo4j courses after local ones
      if (neo4jResponse.status === 'fulfilled' && neo4jResponse.value?.data?.courses) {
        const neo4jCourses = neo4jResponse.value.data.courses;
        // Filter out any duplicates (in case a course exists in both)
        const localIds = new Set(allCourses.map(c => c.id));
        const uniqueNeo4jCourses = neo4jCourses.filter(c => !localIds.has(c.id));
        allCourses = [...allCourses, ...uniqueNeo4jCourses];
        totalCount += neo4jResponse.value.data.pagination?.total || 0;
      }

      // Sort: 1) Visible courses first, 2) Local courses on top within each group
      allCourses.sort((a, b) => {
        // First priority: visibility (visible courses first)
        // Explicitly check for true to handle undefined/null properly
        const aVisible = a.is_visible === true ? 1 : 0;
        const bVisible = b.is_visible === true ? 1 : 0;
        if (aVisible !== bVisible) return bVisible - aVisible;
        
        // Second priority: local courses on top within each visibility group
        const aLocal = (a.source === 'local' || a.is_local) ? 1 : 0;
        const bLocal = (b.source === 'local' || b.is_local) ? 1 : 0;
        return bLocal - aLocal;
      });

      // Apply visibility filter (client-side)
      let filteredCourses = allCourses;
      if (filters.visibility === 'visible') {
        filteredCourses = allCourses.filter(c => c.is_visible === true);
      } else if (filters.visibility === 'hidden') {
        filteredCourses = allCourses.filter(c => c.is_visible !== true);
      }

      setCourses(filteredCourses);
      setPagination(prev => ({
        ...prev,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pagination.limit)
      }));

      // Check if Neo4j failed
      if (neo4jResponse.status === 'rejected') {
        const error = neo4jResponse.reason;
        const errorData = error.response?.data;
        const errorCode = errorData?.code;
        if (errorCode === 'CONFIG_ERROR' && allCourses.length === 0) {
          setSourceError({
            message: errorData?.error || 'خدمة Neo4j غير مُعدّة',
            code: errorCode,
            hint: errorData?.hint,
            source: 'neo4j'
          });
        }
      }
    } catch (error) {
      console.error('Fetch courses error:', error);
      const errorData = error.response?.data;
      const errorCode = errorData?.code;
      const errorMsg = errorData?.error || errorData?.message || 'فشل في تحميل الدورات';

      setSourceError({
        message: errorMsg,
        code: errorCode,
        hint: errorData?.hint,
        source: 'neo4j'
      });
      setCourses([]);

      if (errorCode !== 'CONFIG_ERROR') {
        toast.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchNeo4jFilters = async () => {
    try {
      const response = await api.get('/courses/neo4j/filters?is_prod=false');
      setNeo4jFilters(response.data);
    } catch (error) {
      console.error('Fetch Neo4j filters error:', error);
      // Don't show error toast for filters
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

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters({ ...filters, search: e.target.search.value });
    setPagination({ ...pagination, page: 1 });
  };

  // Handle AI enrichment for a single course
  const handleEnrichCourse = async (course) => {
    if (!course.id) {
      toast.error('معرف الدورة غير متوفر');
      return;
    }

    setEnrichingCourseId(course.id);
    const toastId = toast.loading('🤖 جاري تحليل الدورة بالذكاء الاصطناعي...');

    try {
      const response = await api.post(`/courses/enrich/${course.id}`);
      toast.dismiss(toastId);
      
      if (response.data.success) {
        toast.success('✅ تم إثراء الدورة بنجاح!');
        
        // Update the course in the local state with enriched data
        setCourses(prevCourses => 
          prevCourses.map(c => {
            if (c.id === course.id) {
              const enrichment = response.data.enrichment;
              return {
                ...c,
                domains: enrichment.suggested_domains || [],
                subject: enrichment.suggested_domains?.[0] || c.subject,
                extracted_skills: enrichment.extracted_skills || [],
                learning_outcomes: enrichment.learning_outcomes || [],
                target_audience: enrichment.target_audience || null,
                career_paths: enrichment.career_paths || [],
                industry_tags: enrichment.industry_tags || [],
                summary_ar: enrichment.summary_ar || '',
                summary_en: enrichment.summary_en || '',
                quality_indicators: enrichment.quality_indicators || null,
                is_enriched: true,
                enriched_at: enrichment.enriched_at
              };
            }
            return c;
          })
        );
      } else {
        toast.error('فشل في إثراء الدورة');
      }
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Enrich course error:', error);
      
      if (error.response?.data?.code === 'CONFIG_ERROR') {
        toast.error('OpenAI API غير مُعدّ. يرجى تكوين OPENAI_API_KEY');
      } else {
        toast.error(error.response?.data?.message || 'فشل في إثراء الدورة');
      }
    } finally {
      setEnrichingCourseId(null);
    }
  };

  // Handle quick removal of domain from course card
  const handleRemoveDomain = async (course, domainToRemove) => {
    if (!isAdmin) return;
    
    setRemovingItem({ courseId: course.id, type: 'domain', value: domainToRemove });
    
    try {
      const currentDomains = course.domains || [course.subject].filter(Boolean);
      const newDomains = currentDomains.filter(d => d !== domainToRemove);
      
      await api.patch(`/courses/neo4j/${course.id}`, {
        domains: newDomains,
        subject: newDomains[0] || ''
      });
      
      // Update local state
      setCourses(prev => prev.map(c => 
        c.id === course.id 
          ? { ...c, domains: newDomains, subject: newDomains[0] || '' }
          : c
      ));
      
      toast.success('تم إزالة المجال');
    } catch (error) {
      console.error('Remove domain error:', error);
      toast.error('فشل في إزالة المجال');
    } finally {
      setRemovingItem(null);
    }
  };

  // Handle quick removal of skill from course card
  const handleRemoveSkill = async (course, skillToRemove) => {
    if (!isAdmin) return;
    
    setRemovingItem({ courseId: course.id, type: 'skill', value: skillToRemove });
    
    try {
      await api.delete(`/courses/neo4j/${course.id}/skills/${encodeURIComponent(skillToRemove)}`);
      
      // Update local state
      setCourses(prev => prev.map(c => {
        if (c.id === course.id) {
          return {
            ...c,
            skills: (c.skills || []).filter(s => 
              (s.name_ar !== skillToRemove) && (s.name_en !== skillToRemove)
            ),
            extracted_skills: (c.extracted_skills || []).filter(s => s !== skillToRemove)
          };
        }
        return c;
      }));
      
      toast.success('تم إزالة المهارة');
    } catch (error) {
      console.error('Remove skill error:', error);
      toast.error('فشل في إزالة المهارة');
    } finally {
      setRemovingItem(null);
    }
  };

  const getDifficultyLabel = (level) => {
    const levelLower = level?.toLowerCase();
    const labels = {
      beginner: 'مبتدئ',
      intermediate: 'متوسط',
      advanced: 'متقدم',
    };
    return labels[levelLower] || level;
  };

  const getDifficultyColor = (level) => {
    const levelLower = level?.toLowerCase();
    const colors = {
      beginner: 'bg-green-100 text-green-700',
      intermediate: 'bg-yellow-100 text-yellow-700',
      advanced: 'bg-red-100 text-red-700',
    };
    return colors[levelLower] || 'bg-slate-100 text-slate-700';
  };

  // Toggle description expansion
  const toggleDescription = (courseId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  // Admin: Open edit modal
  const handleEditCourse = (course) => {
    setSelectedCourse(course);
    setEditModalOpen(true);
  };

  // Admin: Open delete confirmation
  const handleDeleteClick = (course) => {
    setSelectedCourse(course);
    setDeleteModalOpen(true);
  };

  // Admin: Confirm delete course
  const handleDeleteConfirm = async () => {
    if (!selectedCourse?.id) return;
    
    setDeleting(true);
    const toastId = toast.loading('جاري حذف الدورة...');
    
    try {
      await api.delete(`/courses/neo4j/${selectedCourse.id}`);
      toast.dismiss(toastId);
      toast.success('تم حذف الدورة بنجاح');
      
      // Remove from local state
      setCourses(prev => prev.filter(c => c.id !== selectedCourse.id));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
      
      setDeleteModalOpen(false);
      setSelectedCourse(null);
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Delete course error:', error);
      toast.error(error.response?.data?.message || 'فشل في حذف الدورة');
    } finally {
      setDeleting(false);
    }
  };

  // Admin: Handle save from edit modal
  const handleSaveCourse = (updatedCourse) => {
    setCourses(prev => prev.map(c => 
      c.id === updatedCourse.id ? { ...c, ...updatedCourse } : c
    ));
    setSelectedCourse(null);
  };

  // Admin: Handle new course added
  const handleCourseAdded = (newCourse) => {
    // Add the new course to the beginning of the list
    setCourses(prev => [newCourse, ...prev]);
    setPagination(prev => ({ ...prev, total: prev.total + 1 }));
    toast.success('تم إضافة الدورة إلى القائمة');
  };

  // Admin: Toggle course visibility for employees (whitelist approach)
  // Courses are hidden by default - toggle adds/removes from visible_courses whitelist
  const handleToggleVisibility = async (course) => {
    if (!course.id) {
      toast.error('معرف الدورة غير متوفر');
      return;
    }

    setTogglingHidden(course.id);
    const isCurrentlyVisible = course.is_visible;
    const toastId = toast.loading(isCurrentlyVisible ? 'جاري إخفاء الدورة...' : 'جاري إظهار الدورة للموظفين...');

    try {
      const response = await api.post(`/courses/neo4j/${course.id}/toggle-hidden`, {
        visible: !isCurrentlyVisible
      });
      
      toast.dismiss(toastId);
      toast.success(response.data.message);

      // Update local state
      setCourses(prev => prev.map(c => 
        c.id === course.id ? { ...c, is_visible: response.data.visible } : c
      ));
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Toggle visibility error:', error);
      toast.error(error.response?.data?.message || 'فشل في تغيير حالة الدورة');
    } finally {
      setTogglingHidden(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">الدورات التدريبية</h1>
          <p className="text-slate-500">استعرض الدورات المتاحة في نظام التوصيات الذكي</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="btn btn-primary"
              title="إضافة دورة جديدة"
            >
              <PlusCircleIcon className="w-5 h-5" />
              إضافة دورة
            </button>
          )}
          <button
            onClick={fetchNeo4jCourses}
            className="btn btn-secondary"
            title="تحديث الدورات"
          >
            <ArrowPathIcon className="w-5 h-5" />
            تحديث
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
            className="space-y-4 pt-4 border-t"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Level Filter */}
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
                  {neo4jFilters?.levels?.length > 0 ? (
                    neo4jFilters.levels.map(level => {
                      const levelLower = level?.toLowerCase();
                      const label = levelLower === 'beginner' ? 'مبتدئ' : 
                                    levelLower === 'intermediate' ? 'متوسط' : 
                                    levelLower === 'advanced' ? 'متقدم' : level;
                      return (
                        <option key={level} value={level}>
                          {label}
                        </option>
                      );
                    })
                  ) : (
                    <>
                      <option value="beginner">مبتدئ</option>
                      <option value="intermediate">متوسط</option>
                      <option value="advanced">متقدم</option>
                    </>
                  )}
                </select>
              </div>

              {/* Subject Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  الموضوع
                </label>
                <select
                  value={filters.subject}
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                  className="input w-full"
                >
                  <option value="">الكل</option>
                  {neo4jFilters?.subjects?.map(subject => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>

              {/* University Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  الجامعة/المؤسسة
                </label>
                <select
                  value={filters.university}
                  onChange={(e) => setFilters({ ...filters, university: e.target.value })}
                  className="input w-full"
                >
                  <option value="">الكل</option>
                  {neo4jFilters?.universities?.map(university => (
                    <option key={university} value={university}>
                      {university}
                    </option>
                  ))}
                </select>
              </div>

              {/* Skill Filter */}
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
                  {neo4jFilters?.skills?.length > 0 ? (
                    neo4jFilters.skills.map(skill => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))
                  ) : (
                    skills.map(skill => (
                      <option key={skill.id} value={skill.name_en || skill.name_ar}>
                        {skill.name_en || skill.name_ar}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Visibility Filter - Admin Only */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    حالة الظهور
                  </label>
                  <select
                    value={filters.visibility}
                    onChange={(e) => setFilters({ ...filters, visibility: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">الكل</option>
                    <option value="visible">ظاهرة فقط</option>
                    <option value="hidden">مخفية فقط</option>
                  </select>
                </div>
              )}
            </div>

            {/* Clear Filters Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setFilters({
                  search: '',
                  difficulty_level: '',
                  skill_id: '',
                  university: '',
                  subject: '',
                  visibility: '',
                })}
                className="text-sm text-slate-600 hover:text-primary-600 transition-colors"
              >
                مسح جميع الفلاتر
              </button>
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
      ) : sourceError ? (
        <div className="card p-12 text-center">
          {sourceError?.code === 'CONFIG_ERROR' ? (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="5" cy="6" r="2" />
                  <circle cx="19" cy="6" r="2" />
                  <circle cx="5" cy="18" r="2" />
                  <circle cx="19" cy="18" r="2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                خدمة الدورات غير مُعدّة
              </h3>
              <p className="text-slate-500 mb-4">
                يرجى تكوين بيانات اعتماد Neo4j API للوصول إلى قاعدة بيانات الدورات
              </p>
              <div className="bg-slate-50 rounded-lg p-4 text-right max-w-md mx-auto mb-4">
                <p className="text-sm text-slate-600 font-mono">
                  # أضف هذه المتغيرات في ملف .env
                  <br />
                  NEO4J_CLIENT_ID=...
                  <br />
                  NEO4J_CLIENT_SECRET=...
                </p>
              </div>
              <button 
                onClick={fetchNeo4jCourses} 
                className="btn btn-primary inline-flex"
              >
                <ArrowPathIcon className="w-5 h-5" />
                إعادة المحاولة
              </button>
            </>
          ) : (
            <>
              <XCircleIcon className="w-16 h-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                تعذر تحميل الدورات
              </h3>
              <p className="text-slate-500 mb-4">{sourceError?.message}</p>
              <button 
                onClick={fetchNeo4jCourses} 
                className="btn btn-primary inline-flex"
              >
                <ArrowPathIcon className="w-5 h-5" />
                إعادة المحاولة
              </button>
            </>
          )}
        </div>
      ) : courses.length === 0 ? (
        <div className="card p-12 text-center">
          <AcademicCapIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد دورات</h3>
          <p className="text-slate-500 mb-4">
            لم يتم العثور على دورات مطابقة للبحث
          </p>
          <button 
            onClick={fetchNeo4jCourses} 
            className="btn btn-primary inline-flex"
          >
            <ArrowPathIcon className="w-5 h-5" />
            تحديث
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {courses.map((course) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`card p-6 hover:shadow-lg transition-shadow ${
                  !course.is_visible ? 'bg-gray-50 border-gray-300 opacity-75' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className={`text-lg font-semibold ${!course.is_visible ? 'text-slate-400' : 'text-slate-800'}`}>
                        {course.name_ar || course.name_en || 'دورة بدون عنوان'}
                      </h3>
                      {/* Domain badges next to title */}
                      {(course.domains?.length > 0 || course.subject) && (
                        (course.domains?.length > 0 ? course.domains.slice(0, 2) : [course.subject]).map((domain, idx) => (
                          <span 
                            key={`title-domain-${idx}`}
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              idx === 0 ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {domain}
                          </span>
                        ))
                      )}
                      {/* Visibility badge - show "visible" for visible courses, "hidden" for hidden */}
                      {isAdmin && course.is_visible && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700 flex items-center gap-1">
                          <EyeIcon className="w-3 h-3" />
                          ظاهر للموظفين
                        </span>
                      )}
                      {isAdmin && !course.is_visible && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-600 flex items-center gap-1">
                          <EyeSlashIcon className="w-3 h-3" />
                          مخفي عن الموظفين
                        </span>
                      )}
                      {/* Manually added course badge */}
                      {(course.source === 'local' || course.is_local) && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                          <PlusCircleIcon className="w-3 h-3" />
                          تمت إضافته يدوياً
                        </span>
                      )}
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getDifficultyColor(course.difficulty_level)}`}>
                        {getDifficultyLabel(course.difficulty_level)}
                      </span>
                      {/* Language Badge */}
                      {course.language && (
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          course.language === 'ar' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {course.language === 'ar' ? 'عربي' : course.language === 'en' ? 'English' : course.language}
                        </span>
                      )}
                      {/* Price Badge */}
                      {(course.price !== undefined && course.price !== null) ? (
                        course.price === 0 ? (
                          <span className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-700 rounded">
                            مجاني
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                            {course.price} ر.س
                          </span>
                        )
                      ) : null}
                      {/* Rating */}
                      {course.rating && (
                        <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded flex items-center gap-1">
                          <StarIcon className="w-3 h-3" />
                          {course.rating}
                        </span>
                      )}
                    </div>
                    
                    {/* English Name - shown as subtitle when different from Arabic */}
                    {course.name_en && course.name_ar && course.name_en !== course.name_ar && (
                      <p className="text-sm text-slate-500 mb-2 font-medium">
                        {course.name_en}
                      </p>
                    )}

                    {/* Course metadata row */}
                    <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-slate-500">
                      {/* Course ID */}
                      {course.id && (
                        <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-xs font-mono">
                          <span className="text-slate-400">ID:</span>
                          <span className="text-slate-600">{String(course.id).substring(0, 12)}{String(course.id).length > 12 ? '...' : ''}</span>
                        </span>
                      )}
                      {/* Course URL */}
                      {course.url && (
                        <a
                          href={course.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary-600 hover:text-primary-700 bg-primary-50 px-2 py-1 rounded text-xs"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>فتح الدورة</span>
                        </a>
                      )}
                    </div>
                    
                    {(course.description_ar || course.description_en) && (
                      <div className="mb-3">
                        <p className={`text-sm text-slate-600 ${
                          expandedDescriptions[course.id] ? '' : 'line-clamp-2'
                        }`}>
                          {course.description_ar || course.description_en}
                        </p>
                        {/* Show English description if different and available */}
                        {expandedDescriptions[course.id] && course.description_en && course.description_ar && course.description_en !== course.description_ar && (
                          <div className="mt-2 p-2 bg-indigo-50 rounded border-r-2 border-indigo-300">
                            <span className="text-xs text-indigo-600 font-medium block mb-1">English Description:</span>
                            <p className="text-sm text-slate-600">
                              {course.description_en}
                            </p>
                          </div>
                        )}
                        {(course.description_ar || course.description_en)?.length > 150 && (
                          <button
                            onClick={() => toggleDescription(course.id)}
                            className="text-xs text-primary-600 hover:text-primary-700 mt-1 font-medium"
                          >
                            {expandedDescriptions[course.id] ? 'اقرأ أقل ↑' : 'اقرأ المزيد ↓'}
                          </button>
                        )}
                      </div>
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
                      {course.platform && (
                        <span>• {course.platform}</span>
                      )}
                      {course.duration_hours && (
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          <span>{course.duration_hours} ساعة</span>
                        </div>
                      )}
                    </div>

                    {/* Skills Section */}
                    {((course.skills && course.skills.length > 0) || (course.extracted_skills && course.extracted_skills.length > 0)) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {/* Regular skills from relationships */}
                        {(course.skills || []).map((skill, idx) => (
                          skill && (skill.name_ar || skill.name_en) && (
                            <span
                              key={`skill-${idx}`}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded flex items-center gap-1"
                              title={skill.relevance ? `ملاءمة: ${(skill.relevance * 100).toFixed(0)}%` : 'مهارة'}
                            >
                              {skill.name_ar || skill.name_en}
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSkill(course, skill.name_ar || skill.name_en);
                                  }}
                                  disabled={removingItem?.courseId === course.id && removingItem?.value === (skill.name_ar || skill.name_en)}
                                  className="hover:text-red-500 transition-colors"
                                  title="إزالة المهارة"
                                >
                                  <XCircleIcon className={`w-3.5 h-3.5 ${
                                    removingItem?.courseId === course.id && removingItem?.value === (skill.name_ar || skill.name_en)
                                      ? 'animate-spin' : ''
                                  }`} />
                                </button>
                              )}
                            </span>
                          )
                        ))}
                        {/* AI-extracted skills (if enriched) */}
                        {course.extracted_skills && course.extracted_skills.map((skill, idx) => (
                          <span
                            key={`ai-skill-${idx}`}
                            className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200 flex items-center gap-1"
                            title="مهارة مستخرجة بالذكاء الاصطناعي"
                          >
                            🤖 {skill}
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSkill(course, skill);
                                }}
                                disabled={removingItem?.courseId === course.id && removingItem?.value === skill}
                                className="hover:text-red-500 transition-colors"
                                title="إزالة المهارة"
                              >
                                <XCircleIcon className={`w-3.5 h-3.5 ${
                                  removingItem?.courseId === course.id && removingItem?.value === skill
                                    ? 'animate-spin' : ''
                                }`} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* AI-Enriched Content Section */}
                    {course.is_enriched && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        {/* AI Summary - Arabic */}
                        {course.summary_ar && (
                          <div className="mb-3">
                            <span className="text-xs font-medium text-slate-500 block mb-1">ملخص الدورة:</span>
                            <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                              {course.summary_ar}
                            </p>
                          </div>
                        )}
                        
                        {/* AI Summary - English */}
                        {course.summary_en && (
                          <div className="mb-3">
                            <span className="text-xs font-medium text-indigo-500 block mb-1">Course Summary:</span>
                            <p className="text-sm text-slate-600 bg-indigo-50 p-2 rounded border-r-2 border-indigo-300">
                              {course.summary_en}
                            </p>
                          </div>
                        )}
                        
                        {/* Target Audience */}
                        {course.target_audience && (
                          <div className="mb-3">
                            <span className="text-xs font-medium text-slate-500 block mb-1">الفئة المستهدفة:</span>
                            <div className="flex flex-wrap gap-2">
                              {typeof course.target_audience === 'object' ? (
                                <>
                                  {course.target_audience.experience_level && (
                                    <span className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded">
                                      👤 {course.target_audience.experience_level}
                                    </span>
                                  )}
                                  {course.target_audience.roles && Array.isArray(course.target_audience.roles) && course.target_audience.roles.slice(0, 3).map((role, idx) => (
                                    <span key={`role-${idx}`} className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded">
                                      🎯 {role}
                                    </span>
                                  ))}
                                  {course.target_audience.prerequisites && Array.isArray(course.target_audience.prerequisites) && course.target_audience.prerequisites.slice(0, 2).map((prereq, idx) => (
                                    <span key={`prereq-${idx}`} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded">
                                      📋 {prereq}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                <span className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded">
                                  👤 {String(course.target_audience)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Quality Indicators */}
                        {course.quality_indicators && typeof course.quality_indicators === 'object' && Object.keys(course.quality_indicators).length > 0 && (
                          <div className="mb-3">
                            <span className="text-xs font-medium text-slate-500 block mb-1">مؤشرات الجودة:</span>
                            <div className="flex flex-wrap gap-2">
                              {course.quality_indicators.content_depth && (
                                <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded flex items-center gap-1">
                                  📊 عمق المحتوى: {course.quality_indicators.content_depth}
                                </span>
                              )}
                              {course.quality_indicators.practical_focus && (
                                <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded flex items-center gap-1">
                                  🔧 التركيز العملي: {course.quality_indicators.practical_focus}
                                </span>
                              )}
                              {course.quality_indicators.up_to_date && (
                                <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded flex items-center gap-1">
                                  🆕 محدث: {course.quality_indicators.up_to_date ? 'نعم' : 'لا'}
                                </span>
                              )}
                              {course.quality_indicators.certification_value && (
                                <span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-1 rounded flex items-center gap-1">
                                  🏅 قيمة الشهادة: {course.quality_indicators.certification_value}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Learning Outcomes */}
                        {course.learning_outcomes && course.learning_outcomes.length > 0 && (
                          <div className="mb-2">
                            <span className="text-xs font-medium text-slate-500 block mb-1">مخرجات التعلم:</span>
                            <div className="flex flex-wrap gap-1">
                              {course.learning_outcomes.slice(0, 3).map((outcome, idx) => (
                                <span key={idx} className="text-xs text-slate-600 bg-blue-50 px-2 py-1 rounded">
                                  ✓ {outcome.length > 50 ? outcome.substring(0, 50) + '...' : outcome}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Career Paths & Industry Tags */}
                        <div className="flex flex-wrap gap-2">
                          {course.career_paths && course.career_paths.slice(0, 3).map((path, idx) => (
                            <span key={`career-${idx}`} className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                              💼 {path}
                            </span>
                          ))}
                          {course.industry_tags && course.industry_tags.slice(0, 2).map((tag, idx) => (
                            <span key={`industry-${idx}`} className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                              🏢 {tag}
                            </span>
                          ))}
                        </div>
                        
                        {/* Enriched At (Admin only) */}
                        {isAdmin && course.enriched_at && (
                          <div className="mt-2 text-xs text-slate-400">
                            تم التحليل: {new Date(course.enriched_at).toLocaleDateString('ar-SA')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 mr-4">
                    {/* Admin: Edit button */}
                    {isAdmin && (
                      <button
                        onClick={() => handleEditCourse(course)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
                        title="تعديل الدورة"
                      >
                        <PencilSquareIcon className="w-5 h-5" />
                      </button>
                    )}
                    {/* Admin: Toggle visibility for employees button */}
                    {isAdmin && (
                      <button
                        onClick={() => handleToggleVisibility(course)}
                        disabled={togglingHidden === course.id}
                        className={`p-2 rounded-lg transition-colors border ${
                          course.is_visible
                            ? 'text-green-600 hover:bg-green-50 border-green-200 bg-green-50'
                            : 'text-gray-600 hover:bg-gray-50 border-gray-300 bg-gray-100'
                        } ${togglingHidden === course.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={course.is_visible ? 'إخفاء الدورة عن الموظفين (ظاهرة حالياً)' : 'إظهار الدورة للموظفين (مخفية حالياً)'}
                      >
                        {togglingHidden === course.id ? (
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        ) : course.is_visible ? (
                          <EyeIcon className="w-5 h-5" />
                        ) : (
                          <EyeSlashIcon className="w-5 h-5" />
                        )}
                      </button>
                    )}
                    {/* AI Enrich button */}
                    {isAdmin && (
                      <button
                        onClick={() => handleEnrichCourse(course)}
                        disabled={enrichingCourseId === course.id}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
                          course.is_enriched 
                            ? 'text-purple-600 hover:bg-purple-50 border border-purple-200' 
                            : 'text-amber-600 hover:bg-amber-50 border border-amber-200'
                        } ${enrichingCourseId === course.id ? 'opacity-50 cursor-not-allowed animate-pulse' : ''}`}
                        title={course.is_enriched ? 'إعادة الإثراء بالذكاء الاصطناعي' : 'إثراء بالذكاء الاصطناعي'}
                      >
                        {enrichingCourseId === course.id ? (
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <SparklesIcon className="w-5 h-5" />
                        )}
                        <span className="text-xs hidden sm:inline">
                          {enrichingCourseId === course.id ? 'جاري...' : 'AI'}
                        </span>
                      </button>
                    )}
                    {/* External link */}
                    {course.url && (
                      <a
                        href={course.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="فتح الدورة"
                      >
                        <LinkIcon className="w-5 h-5" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col items-center gap-3">
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
              {/* Jump to page */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">انتقل إلى صفحة:</span>
                <input
                  type="number"
                  min="1"
                  max={Math.ceil(pagination.total / pagination.limit)}
                  placeholder={pagination.page}
                  className="input w-20 text-center py-1 px-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const targetPage = parseInt(e.target.value);
                      const maxPage = Math.ceil(pagination.total / pagination.limit);
                      if (targetPage >= 1 && targetPage <= maxPage) {
                        setPagination({ ...pagination, page: targetPage });
                        e.target.value = '';
                      }
                    }
                  }}
                  id="page-jump-input"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('page-jump-input');
                    const targetPage = parseInt(input.value);
                    const maxPage = Math.ceil(pagination.total / pagination.limit);
                    if (targetPage >= 1 && targetPage <= maxPage) {
                      setPagination({ ...pagination, page: targetPage });
                      input.value = '';
                    }
                  }}
                  className="btn btn-primary py-1 px-3 text-sm"
                >
                  انتقال
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Admin: Edit Course Modal */}
      <EditCourseModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedCourse(null);
        }}
        course={selectedCourse}
        onSave={handleSaveCourse}
        filterOptions={neo4jFilters || {}}
      />

      {/* Admin: Add Course Modal */}
      <AddCourseModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleCourseAdded}
        filterOptions={neo4jFilters || {}}
      />

      {/* Admin: Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedCourse(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="حذف الدورة"
        message={`هل أنت متأكد من حذف الدورة "${selectedCourse?.name_ar || selectedCourse?.name_en || 'هذه الدورة'}"؟\n\nلا يمكن التراجع عن هذا الإجراء.`}
        confirmText={deleting ? 'جاري الحذف...' : 'حذف'}
        cancelText="إلغاء"
      />
    </div>
  );
}
