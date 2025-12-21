import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DocumentChartBarIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  RocketLaunchIcon,
  StarIcon,
  BookOpenIcon,
  MapIcon,
  SparklesIcon,
  PlusIcon,
  EyeSlashIcon,
  EyeIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { getRoleLabel, getInitials, formatDate } from '../utils/helpers';

export default function Reports() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  
  // Selected employee state
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // Active tab in profile view
  const [activeTab, setActiveTab] = useState('info');
  
  // Recommendations state
  const [recommendations, setRecommendations] = useState(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [hiddenCourseIds, setHiddenCourseIds] = useState(new Set());
  const [futurexCourses, setFuturexCourses] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    learning_map: false,
    learning_favorites: false,
    future_path: false,
    admin_added: false,
    futurex_completed: false,
  });
  
  // Add course modal state
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [newCourse, setNewCourse] = useState({ name: '', url: '' });
  const [addingCourse, setAddingCourse] = useState(false);
  
  // CSV download state
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, [filterDepartment]);

  const fetchUsers = async () => {
    try {
      let url = '/users?role=employee';
      if (filterDepartment) url += `&department_id=${filterDepartment}`;
      
      const response = await api.get(url);
      setUsers(response.data.users || []);
    } catch (error) {
      toast.error('فشل في تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data || []);
    } catch (error) {
      console.error('Failed to fetch departments');
    }
  };

  const fetchEmployeeProfile = async (userId) => {
    setLoadingProfile(true);
    setActiveTab('info');
    try {
      const response = await api.get(`/users/${userId}/full-profile`);
      setEmployeeProfile(response.data);
    } catch (error) {
      toast.error('فشل في تحميل بيانات الموظف');
      setEmployeeProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchRecommendations = async (userId) => {
    setLoadingRecommendations(true);
    try {
      const response = await api.get(`/recommendations/neo4j/${userId}/sections`);
      setRecommendations(response.data.sections || null);
      setHiddenCourseIds(new Set(response.data.hidden_course_ids || []));
      // Extract FutureX courses from response
      if (response.data.futurex_courses) {
        setFuturexCourses(response.data.futurex_courses);
      } else {
        setFuturexCourses(null);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      setRecommendations(null);
      setFuturexCourses(null);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleHideCourse = async (courseId) => {
    if (!selectedUserId) return;
    try {
      await api.post(`/recommendations/admin/${selectedUserId}/hide/${courseId}`);
      toast.success('تم إخفاء الدورة');
      fetchRecommendations(selectedUserId);
    } catch (error) {
      toast.error('فشل في إخفاء الدورة');
    }
  };

  const handleUnhideCourse = async (courseId) => {
    if (!selectedUserId) return;
    try {
      await api.delete(`/recommendations/admin/${selectedUserId}/unhide/${courseId}`);
      toast.success('تم إظهار الدورة');
      fetchRecommendations(selectedUserId);
    } catch (error) {
      toast.error('فشل في إظهار الدورة');
    }
  };

  const handleAddCustomCourse = async () => {
    if (!newCourse.name.trim()) {
      toast.error('اسم الدورة مطلوب');
      return;
    }
    
    setAddingCourse(true);
    try {
      await api.post(`/recommendations/admin/${selectedUserId}/custom`, {
        course_name_ar: newCourse.name.trim(),
        course_url: newCourse.url.trim() || null
      });
      toast.success('تم إضافة الدورة بنجاح');
      setShowAddCourseModal(false);
      setNewCourse({ name: '', url: '' });
      fetchRecommendations(selectedUserId);
    } catch (error) {
      toast.error('فشل في إضافة الدورة');
    } finally {
      setAddingCourse(false);
    }
  };

  const handleDeleteCustomCourse = async (courseId) => {
    if (!selectedUserId) return;
    try {
      await api.delete(`/recommendations/admin/${selectedUserId}/custom/${courseId}`);
      toast.success('تم حذف الدورة');
      fetchRecommendations(selectedUserId);
    } catch (error) {
      toast.error('فشل في حذف الدورة');
    }
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => {
      const isCurrentlyExpanded = prev[sectionKey];
      // Close all sections, then open the clicked one (if it was closed)
      return {
        learning_map: false,
        learning_favorites: false,
        future_path: false,
        admin_added: false,
        futurex_completed: false,
        [sectionKey]: !isCurrentlyExpanded
      };
    });
  };

  const handleDownloadCSV = async () => {
    setDownloadingCSV(true);
    try {
      let url = '/users/reports/comprehensive-csv';
      if (filterDepartment) {
        url += `?department_id=${filterDepartment}`;
      }
      
      const response = await api.get(url, { responseType: 'blob' });
      
      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `تقرير-شامل-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('تم تحميل التقرير بنجاح');
    } catch (error) {
      console.error('Failed to download CSV:', error);
      toast.error('فشل في تحميل التقرير');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    setRecommendations(null);
    setFuturexCourses(null);
    fetchEmployeeProfile(userId);
  };

  const handleCloseProfile = () => {
    setSelectedUserId(null);
    setEmployeeProfile(null);
    setRecommendations(null);
    setFuturexCourses(null);
  };

  // Fetch recommendations when switching to recommendations tab
  useEffect(() => {
    if (activeTab === 'recommendations' && selectedUserId && !recommendations && !loadingRecommendations) {
      fetchRecommendations(selectedUserId);
    }
  }, [activeTab, selectedUserId]);

  const filteredUsers = users.filter(user =>
    user.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
    user.name_en?.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.employee_number?.toLowerCase().includes(search.toLowerCase())
  );

  const getLevelLabel = (level) => {
    switch (level) {
      case 'low': return 'مبتدئ';
      case 'medium': return 'متوسط';
      case 'high': return 'متقدم';
      default: return '-';
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'low': return 'bg-danger-100 text-danger-700';
      case 'medium': return 'bg-warning-100 text-warning-700';
      case 'high': return 'bg-success-100 text-success-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getScoreColor = (score) => {
    if (score === null || score === undefined) return 'bg-slate-300';
    if (score >= 70) return 'bg-success-500';
    if (score >= 40) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  const getTrendIcon = (trend) => {
    if (trend === 'improving') return <ArrowTrendingUpIcon className="w-4 h-4 text-success-600" />;
    if (trend === 'declining') return <ArrowTrendingDownIcon className="w-4 h-4 text-danger-600" />;
    return <MinusIcon className="w-4 h-4 text-slate-400" />;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="badge bg-success-100 text-success-700">مكتمل</span>;
      case 'in_progress':
        return <span className="badge bg-warning-100 text-warning-700">قيد التنفيذ</span>;
      case 'assigned':
        return <span className="badge bg-blue-100 text-blue-700">مُعيّن</span>;
      case 'expired':
        return <span className="badge bg-danger-100 text-danger-700">منتهي</span>;
      default:
        return <span className="badge bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  // Extract skill name from interest key (format: "subject:skillName")
  const parseInterest = (interest) => {
    const parts = interest.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : interest;
  };

  const tabs = [
    { id: 'info', label: 'المعلومات الأساسية', icon: UserCircleIcon },
    { id: 'profile', label: 'الملف الشخصي', icon: BriefcaseIcon },
    { id: 'competency', label: 'مصفوفة الكفاءات', icon: ChartBarIcon },
    { id: 'tests', label: 'الاختبارات والنتائج', icon: ClipboardDocumentListIcon },
    { id: 'recommendations', label: 'التوصيات التدريبية', icon: AcademicCapIcon },
  ];

  const getSectionIcon = (sectionKey) => {
    switch (sectionKey) {
      case 'learning_map': return MapIcon;
      case 'learning_favorites': return HeartIcon;
      case 'future_path': return RocketLaunchIcon;
      case 'admin_added': return SparklesIcon;
      default: return BookOpenIcon;
    }
  };

  const getSectionColor = (sectionKey) => {
    // Use consistent light gray colors for all sections - professional and sophisticated (matching employee view)
    return { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-600', badge: 'bg-slate-100 text-slate-700' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-2">التقارير</h1>
          <p className="text-slate-500">عرض التقارير الشاملة للموظفين ومستوياتهم المهارية</p>
        </div>
        <button
          onClick={handleDownloadCSV}
          disabled={downloadingCSV || loading}
          className="btn btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          {downloadingCSV ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              جاري التحميل...
            </>
          ) : (
            <>
              <ArrowDownTrayIcon className="w-5 h-5" />
              تحميل التقرير الشامل (CSV)
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee List Panel */}
        <div className="lg:col-span-1">
          <div className="card p-4 sticky top-4">
            <h2 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
              <DocumentChartBarIcon className="w-5 h-5" />
              قائمة الموظفين
            </h2>

            {/* Search & Filter */}
            <div className="space-y-3 mb-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="البحث عن موظف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pr-10 text-sm"
                />
              </div>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="input text-sm"
              >
                <option value="">جميع الأقسام</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
                ))}
              </select>
            </div>

            {/* Users List */}
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <UserCircleIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">لا يوجد موظفين</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <motion.button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className={`w-full p-3 rounded-xl text-right transition-all ${
                      selectedUserId === user.id
                        ? 'bg-primary-100 border-2 border-primary-400'
                        : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'
                    }`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${
                        selectedUserId === user.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-primary-100 text-primary-700'
                      }`}>
                        {getInitials(user.name_ar)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{user.name_ar}</p>
                        {user.name_en && (
                          <p className="text-xs text-slate-600 truncate">{user.name_en}</p>
                        )}
                        <p className="text-xs text-slate-500 truncate">{user.department_name_ar || 'بدون قسم'}</p>
                      </div>
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Employee Profile Panel */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {!selectedUserId ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card p-12 text-center"
              >
                <DocumentChartBarIcon className="w-20 h-20 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">اختر موظفاً لعرض تقريره</h3>
                <p className="text-slate-500">اختر موظفاً من القائمة لعرض كافة تفاصيل ملفه الشخصي ونتائج اختباراته</p>
              </motion.div>
            ) : loadingProfile ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card p-12 text-center"
              >
                <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">جاري تحميل بيانات الموظف...</p>
              </motion.div>
            ) : employeeProfile ? (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {/* Profile Header */}
                <div className="card p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                        {getInitials(employeeProfile.user.name_ar)}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-800">{employeeProfile.user.name_ar}</h2>
                        <p className="text-slate-500">{employeeProfile.user.name_en}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="badge bg-primary-100 text-primary-700">
                            {getRoleLabel(employeeProfile.user.role)}
                          </span>
                          <span className={`badge ${employeeProfile.user.is_active ? 'bg-success-100 text-success-700' : 'bg-slate-100 text-slate-500'}`}>
                            {employeeProfile.user.is_active ? 'نشط' : 'غير نشط'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleCloseProfile}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="card p-1 flex gap-1 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
                        activeTab === tab.id
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <tab.icon className="w-5 h-5" />
                      <span className="font-medium text-sm">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                  {/* Basic Info Tab */}
                  {activeTab === 'info' && (
                    <motion.div
                      key="info"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="card p-6"
                    >
                      <h3 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                        <UserCircleIcon className="w-5 h-5" />
                        المعلومات الأساسية
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">البريد الإلكتروني</p>
                          <p className="font-medium text-slate-800" dir="ltr">{employeeProfile.user.email}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">الرقم الوظيفي</p>
                          <p className="font-medium text-slate-800">{employeeProfile.user.employee_number || '-'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">القسم</p>
                          <p className="font-medium text-slate-800">{employeeProfile.user.department_name_ar || 'غير محدد'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">المسمى الوظيفي</p>
                          <p className="font-medium text-slate-800">{employeeProfile.user.job_title_ar || 'غير محدد'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">آخر دخول</p>
                          <p className="font-medium text-slate-800">
                            {employeeProfile.user.last_login ? formatDate(employeeProfile.user.last_login) : 'لم يسجل الدخول بعد'}
                          </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl">
                          <p className="text-sm text-slate-500 mb-1">تاريخ الإنشاء</p>
                          <p className="font-medium text-slate-800">{formatDate(employeeProfile.user.created_at)}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Profile Preferences Tab */}
                  {activeTab === 'profile' && (
                    <motion.div
                      key="profile"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {/* Experience & Qualifications */}
                      <div className="card p-6">
                        <h3 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                          <BriefcaseIcon className="w-5 h-5" />
                          الخبرة والمؤهلات
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 rounded-xl">
                            <p className="text-sm text-slate-500 mb-1">سنوات الخبرة</p>
                            <p className="font-medium text-slate-800">
                              {employeeProfile.profile.years_of_experience !== null 
                                ? `${employeeProfile.profile.years_of_experience} سنة` 
                                : 'غير محدد'}
                            </p>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-xl">
                            <p className="text-sm text-slate-500 mb-1">التخصص</p>
                            <p className="font-medium text-slate-800">{employeeProfile.profile.specialization_ar || 'غير محدد'}</p>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-xl col-span-full">
                            <p className="text-sm text-slate-500 mb-1">آخر مؤهل علمي</p>
                            <p className="font-medium text-slate-800">{employeeProfile.profile.last_qualification_ar || 'غير محدد'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Career Change */}
                      <div className="card p-6">
                        <h3 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                          <RocketLaunchIcon className="w-5 h-5" />
                          التطلعات المهنية
                        </h3>
                        <div className="p-4 bg-slate-50 rounded-xl mb-4">
                          <p className="text-sm text-slate-500 mb-1">هل ينوي تغيير مساره الوظيفي؟</p>
                          <p className="font-medium text-slate-800">
                            {employeeProfile.profile.willing_to_change_career === true 
                              ? 'نعم' 
                              : employeeProfile.profile.willing_to_change_career === false 
                                ? 'لا' 
                                : 'غير محدد'}
                          </p>
                        </div>
                        
                        {employeeProfile.profile.desired_domains && employeeProfile.profile.desired_domains.length > 0 && (
                          <div>
                            <p className="text-sm text-slate-600 mb-3">المجالات الوظيفية المستقبلية:</p>
                            <div className="flex flex-wrap gap-2">
                              {employeeProfile.profile.desired_domains.map((domain) => (
                                <span
                                  key={domain.id}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                                  style={{
                                    backgroundColor: (domain.color || '#502390') + '20',
                                    color: domain.color || '#502390'
                                  }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: domain.color || '#502390' }}
                                  />
                                  {domain.name_ar}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Interests */}
                      <div className="card p-6">
                        <h3 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                          <HeartIcon className="w-5 h-5" />
                          الاهتمامات
                        </h3>
                        {employeeProfile.profile.interests && employeeProfile.profile.interests.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {employeeProfile.profile.interests.map((interest, index) => (
                              <span
                                key={index}
                                className="px-3 py-1.5 bg-pink-50 text-pink-700 rounded-full text-sm"
                              >
                                {parseInterest(interest)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-center py-4">لم يتم تحديد اهتمامات</p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Competency Matrix Tab */}
                  {activeTab === 'competency' && (
                    <motion.div
                      key="competency"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {/* Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card p-4">
                          <p className="text-sm text-slate-500">المجالات</p>
                          <p className="text-2xl font-bold text-primary-700">
                            {employeeProfile.competency_matrix.summary.total_domains || 0}
                          </p>
                        </div>
                        <div className="card p-4">
                          <p className="text-sm text-slate-500">المهارات</p>
                          <p className="text-2xl font-bold text-accent-600">
                            {employeeProfile.competency_matrix.summary.total_skills || 0}
                          </p>
                        </div>
                        <div className="card p-4">
                          <p className="text-sm text-slate-500">تم تقييمها</p>
                          <p className="text-2xl font-bold text-success-600">
                            {employeeProfile.competency_matrix.summary.skills_assessed || 0}
                          </p>
                        </div>
                        <div className="card p-4">
                          <p className="text-sm text-slate-500">الجاهزية</p>
                          <p className="text-2xl font-bold text-secondary-600">
                            {employeeProfile.competency_matrix.summary.overall_readiness || 0}%
                          </p>
                        </div>
                      </div>

                      {/* Domains & Skills */}
                      {employeeProfile.competency_matrix.domains && employeeProfile.competency_matrix.domains.length > 0 ? (
                        employeeProfile.competency_matrix.domains.map((domain) => (
                          <div key={domain.domain_id} className="card overflow-hidden">
                            <div className="h-2" style={{ backgroundColor: domain.domain_color }}></div>
                            <div className="p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h4 className="text-lg font-semibold text-slate-800">{domain.domain_name_ar}</h4>
                                  <p className="text-sm text-slate-500">{domain.domain_name_en}</p>
                                </div>
                                <div className="text-left">
                                  <p className="text-3xl font-bold" style={{ color: domain.domain_color }}>
                                    {domain.proficiency}%
                                  </p>
                                  <p className="text-xs text-slate-500">الإتقان</p>
                                </div>
                              </div>
                              
                              {domain.skills && domain.skills.length > 0 ? (
                                <div className="space-y-3">
                                  {domain.skills.map((skill) => (
                                    <div key={skill.skill_id} className="p-3 bg-slate-50 rounded-xl">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-slate-800">{skill.name_ar}</span>
                                          {skill.current_level && (
                                            <span className={`badge text-xs ${getLevelColor(skill.current_level)}`}>
                                              {getLevelLabel(skill.current_level)}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {getTrendIcon(skill.trend)}
                                          <span className="text-sm font-medium text-slate-600">
                                            {skill.score !== null ? `${skill.score}%` : '-'}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                        {skill.score !== null && (
                                          <div
                                            className={`h-full ${getScoreColor(skill.score)}`}
                                            style={{ width: `${skill.score}%` }}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-500 text-center py-4">لا توجد مهارات في هذا المجال</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="card p-12 text-center">
                          <ChartBarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500">لا توجد مجالات مرتبطة بقسم الموظف</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Tests & Results Tab */}
                  {activeTab === 'tests' && (
                    <motion.div
                      key="tests"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="card p-6"
                    >
                      <h3 className="text-lg font-semibold text-primary-700 mb-4 flex items-center gap-2">
                        <ClipboardDocumentListIcon className="w-5 h-5" />
                        الاختبارات والنتائج
                      </h3>
                      
                      {employeeProfile.test_assignments && employeeProfile.test_assignments.length > 0 ? (
                        <div className="space-y-4">
                          {employeeProfile.test_assignments.map((assignment) => (
                            <div 
                              key={assignment.assignment_id} 
                              className={`border rounded-xl overflow-hidden ${
                                assignment.needs_grading 
                                  ? 'border-amber-300 bg-amber-50/30' 
                                  : 'border-slate-200'
                              }`}
                            >
                              <div 
                                className="h-1"
                                style={{ backgroundColor: assignment.test.domain_color || '#502390' }}
                              />
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-semibold text-slate-800">{assignment.test.title_ar}</h4>
                                      {/* Needs Grading Tag */}
                                      {assignment.needs_grading && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                                          <ExclamationTriangleIcon className="w-3 h-3" />
                                          يحتاج تقييم ({assignment.ungraded_count} سؤال)
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-500">{assignment.test.domain_name_ar}</p>
                                  </div>
                                  <div className="text-left flex items-center gap-2">
                                    {getStatusBadge(assignment.status)}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                  <div className="p-2 bg-slate-50 rounded-lg">
                                    <p className="text-slate-500 text-xs">تاريخ التعيين</p>
                                    <p className="font-medium text-slate-700">{formatDate(assignment.assigned_at)}</p>
                                  </div>
                                  {assignment.due_date && (
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                      <p className="text-slate-500 text-xs">تاريخ الاستحقاق</p>
                                      <p className="font-medium text-slate-700">{formatDate(assignment.due_date)}</p>
                                    </div>
                                  )}
                                  {assignment.completed_at && (
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                      <p className="text-slate-500 text-xs">تاريخ الإكمال</p>
                                      <p className="font-medium text-slate-700">{formatDate(assignment.completed_at)}</p>
                                    </div>
                                  )}
                                  {assignment.result && (
                                    <div className={`p-2 rounded-lg ${assignment.needs_grading ? 'bg-amber-50' : 'bg-primary-50'}`}>
                                      <p className={`text-xs ${assignment.needs_grading ? 'text-amber-600' : 'text-primary-600'}`}>
                                        الدرجة {assignment.needs_grading && '(غير نهائية)'}
                                      </p>
                                      <p className={`font-bold text-lg ${assignment.needs_grading ? 'text-amber-700' : 'text-primary-700'}`}>
                                        {assignment.result.overall_score}%
                                      </p>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Strengths & Gaps */}
                                {assignment.result && (
                                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {assignment.result.strengths && assignment.result.strengths.length > 0 && (
                                      <div className="p-3 bg-success-50 rounded-xl">
                                        <p className="text-xs font-medium text-success-600 mb-2 flex items-center gap-1">
                                          <CheckCircleIcon className="w-4 h-4" />
                                          نقاط القوة
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {assignment.result.strengths.slice(0, 3).map((s, i) => (
                                            <span key={i} className="text-xs text-success-700 bg-success-100 px-2 py-1 rounded">
                                              {s.skill_name_ar}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {assignment.result.gaps && assignment.result.gaps.length > 0 && (
                                      <div className="p-3 bg-warning-50 rounded-xl">
                                        <p className="text-xs font-medium text-warning-600 mb-2 flex items-center gap-1">
                                          <ExclamationCircleIcon className="w-4 h-4" />
                                          فجوات المهارات
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {assignment.result.gaps.slice(0, 3).map((g, i) => (
                                            <span key={i} className="text-xs text-warning-700 bg-warning-100 px-2 py-1 rounded">
                                              {g.skill_name_ar}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* View Results Button */}
                                {assignment.result && (
                                  <div className="mt-4 flex justify-end">
                                    <Link
                                      to={`/results/${assignment.result.analysis_id}?assignment_id=${assignment.assignment_id}`}
                                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        assignment.needs_grading
                                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                          : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                                      }`}
                                    >
                                      <EyeIcon className="w-4 h-4" />
                                      {assignment.needs_grading ? 'تقييم الأسئلة المفتوحة' : 'عرض النتائج'}
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <ClipboardDocumentListIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500">لم يتم تعيين اختبارات لهذا الموظف</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Training Recommendations Tab */}
                  {activeTab === 'recommendations' && (
                    <motion.div
                      key="recommendations"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {/* Add Course Button */}
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-primary-700 flex items-center gap-2">
                          <AcademicCapIcon className="w-5 h-5" />
                          التوصيات التدريبية
                        </h3>
                        <button
                          onClick={() => setShowAddCourseModal(true)}
                          className="btn btn-primary btn-sm"
                        >
                          <PlusIcon className="w-4 h-4" />
                          إضافة دورة
                        </button>
                      </div>

                      {loadingRecommendations ? (
                        <div className="card p-12 text-center">
                          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
                          <p className="text-slate-600">جاري تحميل التوصيات...</p>
                        </div>
                      ) : (recommendations || futurexCourses) ? (
                        <div className="space-y-4">
                          {/* Render each section */}
                          {recommendations && ['learning_map', 'learning_favorites', 'future_path', 'admin_added'].map((sectionKey) => {
                            const sectionData = recommendations[sectionKey];
                            if (!sectionData) return null;
                            
                            const SectionIcon = getSectionIcon(sectionKey);
                            const colors = getSectionColor(sectionKey);
                            const isExpanded = expandedSections[sectionKey];
                            const hasRecommendations = sectionData.recommendations && sectionData.recommendations.length > 0;

                            return (
                              <div key={sectionKey} className={`card overflow-hidden ${colors.border} border-2`}>
                                {/* Section Header */}
                                <button
                                  onClick={() => toggleSection(sectionKey)}
                                  className={`w-full p-4 ${colors.bg} flex items-center justify-between hover:opacity-90 transition-opacity`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl ${colors.bg} border-2 ${colors.border} flex items-center justify-center`}>
                                      <SectionIcon className={`w-5 h-5 ${colors.icon}`} />
                                    </div>
                                    <div className="text-right">
                                      <h4 className="font-bold text-slate-800">{sectionData.title_ar}</h4>
                                      <p className="text-sm text-slate-600">{sectionData.description_ar}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors.badge}`}>
                                      {sectionData.count} دورة
                                    </span>
                                    {isExpanded ? (
                                      <ChevronUpIcon className="w-5 h-5 text-slate-500" />
                                    ) : (
                                      <ChevronDownIcon className="w-5 h-5 text-slate-500" />
                                    )}
                                  </div>
                                </button>

                                {/* Section Content */}
                                {isExpanded && (
                                  <div className="p-4 space-y-3">
                                    {hasRecommendations ? (
                                      sectionData.recommendations.map((rec, index) => (
                                        <div
                                          key={rec.id || rec.course_id || index}
                                          className={`p-4 bg-white border rounded-xl ${
                                            rec.is_completed 
                                              ? 'border-success-300 bg-success-50/30' 
                                              : 'border-slate-200'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 flex-1">
                                              <div
                                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                                  rec.is_completed ? 'bg-success-100' : ''
                                                }`}
                                                style={!rec.is_completed ? { backgroundColor: (rec.domain_color || '#502390') + '20' } : undefined}
                                              >
                                                {rec.is_completed ? (
                                                  <CheckCircleSolidIcon className="w-5 h-5 text-success-600" />
                                                ) : (
                                                  <BookOpenIcon
                                                    className="w-5 h-5"
                                                    style={{ color: rec.domain_color || '#502390' }}
                                                  />
                                                )}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <h5 className="font-semibold text-slate-800">
                                                    {rec.name_ar || rec.course_title_ar}
                                                  </h5>
                                                  {rec.is_completed && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-100 text-success-700 rounded-full text-xs font-medium">
                                                      <CheckCircleSolidIcon className="w-3 h-3" />
                                                      مكتمل
                                                    </span>
                                                  )}
                                                </div>
                                                {(rec.description_ar || rec.course_description_ar) && (
                                                  <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                                                    {rec.description_ar || rec.course_description_ar}
                                                  </p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                  {rec.matching_skills && rec.matching_skills.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                      {rec.matching_skills.slice(0, 3).map((skill, idx) => (
                                                        <span key={idx} className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full text-xs">
                                                          {skill}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  )}
                                                  {rec.recommendation_score > 0 && !rec.is_completed && (
                                                    <span className="badge bg-green-100 text-green-700 flex items-center gap-1 text-xs">
                                                      <SparklesIcon className="w-3 h-3" />
                                                      {Math.round(rec.recommendation_score)}%
                                                    </span>
                                                  )}
                                                  {rec.duration_hours && (
                                                    <span className="text-xs text-slate-500 flex items-center gap-1">
                                                      <ClockIcon className="w-3 h-3" />
                                                      {rec.duration_hours} ساعة
                                                    </span>
                                                  )}
                                                  {rec.provider && (
                                                    <span className="text-xs text-slate-500">{rec.provider}</span>
                                                  )}
                                                  {rec.source === 'admin_added' && rec.added_by_name && (
                                                    <span className="text-xs text-purple-600">
                                                      أضافه: {rec.added_by_name}
                                                    </span>
                                                  )}
                                                  {/* Show completion date */}
                                                  {rec.is_completed && rec.completion_certificate?.completed_at && (
                                                    <span className="text-xs text-success-600 flex items-center gap-1">
                                                      <CheckCircleIcon className="w-3 h-3" />
                                                      تاريخ الإتمام: {new Date(rec.completion_certificate.completed_at).toLocaleDateString('ar-SA')}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                            
                                            {/* Actions */}
                                            <div className="flex items-center gap-2 shrink-0">
                                              {/* Download Certificate button */}
                                              {rec.is_completed && rec.completion_certificate?.id && (
                                                <a
                                                  href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/recommendations/certificate/${rec.completion_certificate.id}/download`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="p-2 text-success-600 hover:text-success-700 hover:bg-success-50 rounded-lg transition-colors flex items-center gap-1"
                                                  title={`تحميل الشهادة: ${rec.completion_certificate.original_filename}`}
                                                >
                                                  <ArrowDownTrayIcon className="w-4 h-4" />
                                                  <span className="text-xs hidden sm:inline">الشهادة</span>
                                                </a>
                                              )}
                                              
                                              {(rec.url || rec.course_url) && (
                                                <a
                                                  href={rec.url || rec.course_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                  title="فتح الرابط"
                                                >
                                                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                                </a>
                                              )}
                                              
                                              {/* Hide/Unhide button for regular courses */}
                                              {rec.source !== 'admin_added' && rec.course_id && (
                                                hiddenCourseIds.has(rec.course_id) ? (
                                                  <button
                                                    onClick={() => handleUnhideCourse(rec.course_id)}
                                                    className="p-2 text-slate-500 hover:text-success-600 hover:bg-success-50 rounded-lg transition-colors"
                                                    title="إظهار الدورة"
                                                  >
                                                    <EyeIcon className="w-4 h-4" />
                                                  </button>
                                                ) : (
                                                  <button
                                                    onClick={() => handleHideCourse(rec.course_id)}
                                                    className="p-2 text-slate-500 hover:text-warning-600 hover:bg-warning-50 rounded-lg transition-colors"
                                                    title="إخفاء الدورة"
                                                  >
                                                    <EyeSlashIcon className="w-4 h-4" />
                                                  </button>
                                                )
                                              )}
                                              
                                              {/* Delete button for admin-added courses */}
                                              {rec.source === 'admin_added' && (
                                                <button
                                                  onClick={() => handleDeleteCustomCourse(rec.id)}
                                                  className="p-2 text-slate-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                                                  title="حذف الدورة"
                                                >
                                                  <TrashIcon className="w-4 h-4" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-center py-6 text-slate-500">
                                        <BookOpenIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                                        <p className="text-sm">لا توجد توصيات في هذا القسم</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* FutureX Completed Courses Section */}
                          {futurexCourses && futurexCourses.courses?.length > 0 && (
                            <div className="card overflow-hidden border-2 border-slate-200">
                              {/* Section Header */}
                              <button
                                onClick={() => toggleSection('futurex_completed')}
                                className="w-full p-4 bg-slate-50 flex items-center justify-between hover:opacity-90 transition-opacity"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center justify-center">
                                    <AcademicCapIcon className="w-5 h-5 text-slate-600" />
                                  </div>
                                  <div className="text-right">
                                    <h4 className="font-bold text-slate-800">دورات FutureX المكتملة</h4>
                                    <p className="text-sm text-slate-600">الدورات التي أكملها الموظف في منصة FutureX</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                                    {futurexCourses.completed_in_nelc || 0} مكتملة
                                  </span>
                                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                                    {futurexCourses.total || 0} إجمالي
                                  </span>
                                  {expandedSections.futurex_completed ? (
                                    <ChevronUpIcon className="w-5 h-5 text-slate-500" />
                                  ) : (
                                    <ChevronDownIcon className="w-5 h-5 text-slate-500" />
                                  )}
                                </div>
                              </button>

                              {/* Section Content */}
                              {expandedSections.futurex_completed && (
                                <div className="p-4 space-y-3">
                                  {/* Summary Stats */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                                      <div className="text-2xl font-bold text-slate-800">{futurexCourses.total || 0}</div>
                                      <div className="text-xs text-slate-500">إجمالي الدورات</div>
                                    </div>
                                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                                      <div className="text-2xl font-bold text-green-700">{futurexCourses.completed_in_nelc || 0}</div>
                                      <div className="text-xs text-slate-500">مكتملة</div>
                                    </div>
                                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                                      <div className="text-2xl font-bold text-green-700">{futurexCourses.matched || 0}</div>
                                      <div className="text-xs text-slate-500">وفق نطاق الاحتياج</div>
                                    </div>
                                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                                      <div className="text-2xl font-bold text-slate-700">{futurexCourses.unmatched || 0}</div>
                                      <div className="text-xs text-slate-500">خارج نطاق الاحتياج</div>
                                    </div>
                                  </div>

                                  {/* Course List */}
                                  <div className="space-y-2">
                                    {futurexCourses.courses.map((course, index) => (
                                      <div
                                        key={index}
                                        className="p-3 rounded-lg border bg-slate-50 border-slate-200"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <h5 className="font-medium text-slate-800">
                                              {course.nelc_course.name}
                                            </h5>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                course.nelc_course.status === 'Completed' 
                                                  ? 'bg-green-100 text-green-700' 
                                                  : 'bg-slate-200 text-slate-700'
                                              }`}>
                                                {course.nelc_course.status === 'Completed' ? 'مكتمل' :
                                                 course.nelc_course.status === 'In Progress' ? 'قيد التقدم' :
                                                 course.nelc_course.status === 'Enrolled' ? 'مسجل' : course.nelc_course.status}
                                              </span>
                                              {course.has_match ? (
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                  <CheckCircleIcon className="w-3 h-3" />
                                                  وفق نطاق الاحتياج
                                                </span>
                                              ) : (
                                                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                                  خارج نطاق الاحتياج
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {course.nelc_course.url && (
                                            <a
                                              href={course.nelc_course.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-slate-600 hover:text-slate-800"
                                            >
                                              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="card p-12 text-center">
                          <AcademicCapIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-slate-700 mb-2">لا توجد توصيات</h3>
                          <p className="text-slate-500 mb-4">لم يتم العثور على توصيات لهذا الموظف</p>
                          <button
                            onClick={() => setShowAddCourseModal(true)}
                            className="btn btn-primary"
                          >
                            <PlusIcon className="w-5 h-5" />
                            إضافة دورة مخصصة
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Course Modal */}
      <AnimatePresence>
        {showAddCourseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddCourseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-primary-700 flex items-center gap-2">
                    <PlusIcon className="w-6 h-6" />
                    إضافة دورة مخصصة
                  </h2>
                  <button
                    onClick={() => setShowAddCourseModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  أضف دورة تدريبية مخصصة لهذا الموظف. ستظهر في توصياته التدريبية.
                </p>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    اسم الدورة <span className="text-danger-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCourse.name}
                    onChange={(e) => setNewCourse(prev => ({ ...prev, name: e.target.value }))}
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
                    value={newCourse.url}
                    onChange={(e) => setNewCourse(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://example.com/course"
                    className="input"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddCourseModal(false);
                    setNewCourse({ name: '', url: '' });
                  }}
                  className="btn btn-secondary"
                  disabled={addingCourse}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddCustomCourse}
                  className="btn btn-primary"
                  disabled={addingCourse || !newCourse.name.trim()}
                >
                  {addingCourse ? (
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

