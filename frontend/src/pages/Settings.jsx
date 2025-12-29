import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCircleIcon,
  KeyIcon,
  BellIcon,
  GlobeAltIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  DocumentArrowUpIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api, { getCVImportHistory, deleteCVImport } from '../utils/api';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/helpers';
import CVImportModal from '../components/CVImportModal';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function Settings() {
  const { user, updateUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');

  // Read tab from URL params on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['profile', 'employee-profile', 'cv-import', 'security'].includes(tabParam)) {
      setActiveTab(tabParam);
      // Clear the URL param after reading
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Employee Profile State
  const [employeeProfile, setEmployeeProfile] = useState({
    years_of_experience: '',
    interests: [], // Array of skill identifiers like "thinking:التحليل النقدي"
    specialization_ar: '',
    specialization_en: '',
    last_qualification_ar: '',
    last_qualification_en: '',
    willing_to_change_career: null,
    desired_domains: [], // Array of domain IDs for career aspirations
  });
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [domains, setDomains] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  
  // Course-derived skills state (replaces static SKILLS_DATA)
  const [courseSkillsDomains, setCourseSkillsDomains] = useState([]);
  const [loadingCourseSkills, setLoadingCourseSkills] = useState(false);

  // Fetch employee profile, domains, and course-derived skills
  useEffect(() => {
    if (user?.role === 'employee' && activeTab === 'employee-profile') {
      fetchEmployeeProfile();
      fetchDomains();
      fetchCourseSkills();
    }
  }, [activeTab, user]);

  const fetchDomains = async () => {
    setLoadingDomains(true);
    try {
      const response = await api.get('/domains');
      setDomains(response.data || []);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    } finally {
      setLoadingDomains(false);
    }
  };

  // Fetch course-derived skills for interests selection
  const fetchCourseSkills = async () => {
    setLoadingCourseSkills(true);
    try {
      const response = await api.get('/domains/course-skills');
      setCourseSkillsDomains(response.data?.domains || []);
      console.log('📚 Loaded course-derived skills:', response.data?.stats);
    } catch (error) {
      console.error('Failed to fetch course-derived skills:', error);
      // Fallback to empty - UI will show message
      setCourseSkillsDomains([]);
    } finally {
      setLoadingCourseSkills(false);
    }
  };

  const fetchEmployeeProfile = async () => {
    setLoadingProfile(true);
    try {
      const response = await api.get('/users/profile/me');
      setEmployeeProfile({
        years_of_experience: response.data.years_of_experience || '',
        interests: response.data.interests || [],
        specialization_ar: response.data.specialization_ar || '',
        specialization_en: response.data.specialization_en || '',
        last_qualification_ar: response.data.last_qualification_ar || '',
        last_qualification_en: response.data.last_qualification_en || '',
        willing_to_change_career: response.data.willing_to_change_career,
        desired_domains: response.data.desired_domains || [],
      });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const toggleSubjectExpand = (subjectId) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectId]: !prev[subjectId]
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    
    if (!employeeProfile.years_of_experience || employeeProfile.years_of_experience < 0) {
      toast.error('الرجاء إدخال سنوات الخبرة بشكل صحيح');
      return;
    }

    setSavingProfile(true);
    try {
      const response = await api.put('/users/profile/me', employeeProfile);
      // Update auth store with profile_completed flag
      if (response.data.profile_completed) {
        updateUser({ profile_completed: true });
      }
      toast.success('تم حفظ الملف الشخصي بنجاح');
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حفظ الملف الشخصي');
    } finally {
      setSavingProfile(false);
    }
  };

  // Toggle skill interest - now uses skill ID and English name for recommendation matching
  // Format: "skillId:skillNameEn" (or "domainId:skillNameEn" if no skill ID)
  const toggleSkillInterest = (domainId, skill) => {
    // Create a key that includes the English name for recommendation matching
    const skillId = skill.id || `${domainId}-${(skill.name_en || skill.name_ar).toLowerCase().replace(/\s+/g, '-')}`;
    const skillKey = `${skillId}:${skill.name_en || skill.name_ar}`;
    
    setEmployeeProfile(prev => {
      const interests = prev.interests || [];
      // Check if already selected (match by skill ID prefix)
      const existingIndex = interests.findIndex(key => key.startsWith(`${skillId}:`));
      if (existingIndex !== -1) {
        return { ...prev, interests: interests.filter((_, idx) => idx !== existingIndex) };
      } else {
        return { ...prev, interests: [...interests, skillKey] };
      }
    });
  };

  // Check if skill is selected - matches by skill ID
  const isSkillSelected = (domainId, skill) => {
    const skillId = skill.id || `${domainId}-${(skill.name_en || skill.name_ar).toLowerCase().replace(/\s+/g, '-')}`;
    return (employeeProfile.interests || []).some(key => key.startsWith(`${skillId}:`));
  };

  // Get count of selected skills for a domain
  const getSelectedCountForSubject = (domainId, skills) => {
    return (skills || []).filter(skill => isSkillSelected(domainId, skill)).length;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('الرجاء ملء جميع الحقول');
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('كلمة المرور الجديدة غير متطابقة');
      return;
    }
    
    if (passwordForm.newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    setChangingPassword(true);
    
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      
      toast.success('تم تغيير كلمة المرور بنجاح');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في تغيير كلمة المرور');
    } finally {
      setChangingPassword(false);
    }
  };

  const [showCVModal, setShowCVModal] = useState(false);
  const [cvImportHistory, setCvImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showDeleteCVModal, setShowDeleteCVModal] = useState(false);
  const [deletingCV, setDeletingCV] = useState(false);

  // Fetch CV import history
  useEffect(() => {
    if (user?.role === 'employee' && activeTab === 'cv-import') {
      fetchCVImportHistory();
    }
  }, [activeTab, user]);

  const fetchCVImportHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await getCVImportHistory();
      setCvImportHistory(response.data || []);
    } catch (error) {
      console.error('Failed to fetch CV import history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCVImportSuccess = () => {
    fetchCVImportHistory();
  };

  const handleDeleteCV = async () => {
    setDeletingCV(true);
    try {
      const response = await deleteCVImport();
      toast.success(response.data.message || 'تم حذف السيرة الذاتية والمهارات المرتبطة بها بنجاح');
      setCvImportHistory([]);
      setShowDeleteCVModal(false);
    } catch (error) {
      console.error('Failed to delete CV:', error);
      toast.error(error.response?.data?.message || 'فشل في حذف السيرة الذاتية');
    } finally {
      setDeletingCV(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'الملف الشخصي', icon: UserCircleIcon },
    ...(user?.role === 'employee' ? [
      { id: 'employee-profile', label: 'الخبرة والاهتمامات', icon: BriefcaseIcon },
      { id: 'cv-import', label: 'استيراد السيرة الذاتية', icon: DocumentArrowUpIcon },
    ] : []),
    { id: 'security', label: 'الأمان', icon: KeyIcon },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">الإعدادات</h1>
        <p className="text-slate-500">إدارة حسابك وتفضيلاتك</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-white' : 'text-primary-600'}`} />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6"
            >
              <h2 className="text-lg font-semibold text-primary-700 mb-6">الملف الشخصي</h2>
              
              {/* Avatar */}
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                  {user?.name_ar?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">{user?.name_ar}</h3>
                  <p className="text-slate-500">{user?.email}</p>
                  <span className="inline-block mt-2 badge badge-primary">
                    {getRoleLabel(user?.role)}
                  </span>
                </div>
              </div>
              
              {/* Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label">الاسم بالعربية</label>
                  <input
                    type="text"
                    value={user?.name_ar || ''}
                    className="input"
                    disabled
                  />
                </div>
                <div>
                  <label className="label">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={user?.name_en || ''}
                    className="input"
                    dir="ltr"
                    disabled
                  />
                </div>
                <div>
                  <label className="label">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    className="input"
                    dir="ltr"
                    disabled
                  />
                </div>
                <div>
                  <label className="label">القسم</label>
                  <input
                    type="text"
                    value={user?.department_name_ar || 'غير محدد'}
                    className="input"
                    disabled
                  />
                </div>
                <div>
                  <label className="label">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={user?.job_title_ar || 'غير محدد'}
                    className="input"
                    disabled
                  />
                </div>
                <div>
                  <label className="label">الرقم الوظيفي</label>
                  <input
                    type="text"
                    value={user?.employee_number || 'غير محدد'}
                    className="input"
                    dir="ltr"
                    disabled
                  />
                </div>
              </div>

              {/* National ID - Read Only */}
              <div className="mt-6 p-4 bg-primary-50 border border-primary-200 rounded-xl">
                <label className="label text-primary-700">رقم الهوية الوطنية (المعرّف الرئيسي)</label>
                <input
                  type="text"
                  value={user?.national_id || 'غير محدد'}
                  className="input bg-white"
                  dir="ltr"
                  disabled
                />
                <p className="text-xs text-primary-600 mt-2">
                  هذا الرقم هو المعرّف الرئيسي الخاص بك ولا يمكن تغييره. للتعديل، يرجى التواصل مع مدير النظام.
                </p>
              </div>
              
              <p className="text-sm text-slate-400 mt-6">
                للتعديل على بياناتك، يرجى التواصل مع مدير النظام على البريد الإلكتروني: hcx@elc.edu.sa
              </p>
            </motion.div>
          )}

          {/* Employee Profile Tab */}
          {activeTab === 'employee-profile' && user?.role === 'employee' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6"
            >
              <h2 className="text-lg font-semibold text-primary-700 mb-6">الخبرة والاهتمامات</h2>
              
              {loadingProfile ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700"></div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Years of Experience */}
                  <div>
                    <label className="label">سنوات الخبرة *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={employeeProfile.years_of_experience}
                      onChange={(e) => setEmployeeProfile({ ...employeeProfile, years_of_experience: e.target.value })}
                      className="input max-w-xs"
                      placeholder="أدخل عدد سنوات الخبرة"
                      required
                    />
                  </div>

                  {/* Interests - Dynamic from course-derived skills */}
                  <div>
                    <label className="label">الاهتمامات (المهارات والمواضيع) *</label>
                    <p className="text-sm text-slate-500 mb-3">اختر المجالات والمهارات التي تهتم بها - مرتبطة بالدورات المتاحة</p>
                    
                    {loadingCourseSkills ? (
                      <div className="flex justify-center items-center py-12 bg-slate-50 rounded-xl">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-700 mx-auto mb-3"></div>
                          <p className="text-sm text-slate-500">جاري تحميل المهارات المتاحة...</p>
                        </div>
                      </div>
                    ) : courseSkillsDomains.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-slate-500 mb-2">لا توجد مهارات متاحة حالياً</p>
                        <p className="text-xs text-slate-400">سيتم إضافة المهارات عند توفر دورات في النظام</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[600px] overflow-y-auto p-4 bg-slate-50 rounded-xl">
                        {courseSkillsDomains.map((domain) => {
                          const selectedCount = getSelectedCountForSubject(domain.id, domain.skills);
                          const isExpanded = expandedSubjects[domain.id];
                          
                          return (
                            <div key={domain.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                              {/* Domain Header */}
                              <button
                                type="button"
                                onClick={() => toggleSubjectExpand(domain.id)}
                                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: domain.color || '#502390' }}
                                  ></div>
                                  <div className="text-right">
                                    <span className="font-semibold text-slate-800">{domain.name_ar}</span>
                                    {domain.name_en && domain.name_en !== domain.name_ar && (
                                      <span className="text-xs text-slate-500 mr-2">({domain.name_en})</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    {domain.skills?.length || 0} مهارة
                                  </span>
                                  {selectedCount > 0 && (
                                    <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                                      {selectedCount} مختارة
                                    </span>
                                  )}
                                </div>
                                <ChevronDownIcon 
                                  className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                                />
                              </button>
                              
                              {/* Skills List */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                                      {domain.skills && domain.skills.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {domain.skills.map((skill, skillIndex) => (
                                            <label
                                              key={skill.id || skillIndex}
                                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                isSkillSelected(domain.id, skill)
                                                  ? 'bg-primary-50 border-primary-400'
                                                  : 'bg-slate-50 border-slate-200 hover:border-primary-300'
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={isSkillSelected(domain.id, skill)}
                                                onChange={() => toggleSkillInterest(domain.id, skill)}
                                                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                                              />
                                              <div className="flex-1">
                                                <span className={`text-sm block ${isSkillSelected(domain.id, skill) ? 'text-primary-700 font-medium' : 'text-slate-700'}`}>
                                                  {skill.name_ar}
                                                </span>
                                                {skill.name_en && skill.name_en !== skill.name_ar && (
                                                  <span className="text-xs text-slate-400">{skill.name_en}</span>
                                                )}
                                              </div>
                                            </label>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-slate-400 text-center py-4">لا توجد مهارات في هذا المجال</p>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {employeeProfile.interests?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-primary-600 font-medium mb-2">
                          تم اختيار {employeeProfile.interests.length} مهارة/مهارات
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {employeeProfile.interests.map((interestKey, idx) => {
                            // Extract skill name from key format "skillId:skillName"
                            const parts = interestKey.split(':');
                            const skillName = parts.length > 1 ? parts.slice(1).join(':') : interestKey;
                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs"
                              >
                                {skillName}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmployeeProfile(prev => ({
                                      ...prev,
                                      interests: (prev.interests || []).filter(k => k !== interestKey)
                                    }));
                                  }}
                                  className="hover:text-primary-900 font-bold"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Specialization */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">التخصص (عربي) *</label>
                      <input
                        type="text"
                        value={employeeProfile.specialization_ar}
                        onChange={(e) => setEmployeeProfile({ ...employeeProfile, specialization_ar: e.target.value })}
                        className="input"
                        placeholder="مثال: تقنية المعلومات"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">التخصص (إنجليزي) *</label>
                      <input
                        type="text"
                        value={employeeProfile.specialization_en}
                        onChange={(e) => setEmployeeProfile({ ...employeeProfile, specialization_en: e.target.value })}
                        className="input"
                        dir="ltr"
                        placeholder="e.g., Information Technology"
                        required
                      />
                    </div>
                  </div>

                  {/* Last Qualification */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">آخر مؤهل علمي (عربي) *</label>
                      <input
                        type="text"
                        value={employeeProfile.last_qualification_ar}
                        onChange={(e) => setEmployeeProfile({ ...employeeProfile, last_qualification_ar: e.target.value })}
                        className="input"
                        placeholder="مثال: بكالوريوس علوم الحاسب"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">آخر مؤهل علمي (إنجليزي) *</label>
                      <input
                        type="text"
                        value={employeeProfile.last_qualification_en}
                        onChange={(e) => setEmployeeProfile({ ...employeeProfile, last_qualification_en: e.target.value })}
                        className="input"
                        dir="ltr"
                        placeholder="e.g., Bachelor of Computer Science"
                        required
                      />
                    </div>
                  </div>

                  {/* Willing to Change Career */}
                  <div>
                    <label className="label">هل تنوي تغيير مسارك الوظيفي؟</label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="willing_to_change_career"
                          checked={employeeProfile.willing_to_change_career === true}
                          onChange={() => setEmployeeProfile({ ...employeeProfile, willing_to_change_career: true })}
                          className="w-5 h-5 text-primary-600 focus:ring-primary-500"
                          required
                        />
                        <span className="text-slate-700">نعم</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="willing_to_change_career"
                          checked={employeeProfile.willing_to_change_career === false}
                          onChange={() => setEmployeeProfile({ ...employeeProfile, willing_to_change_career: false })}
                          className="w-5 h-5 text-primary-600 focus:ring-primary-500"
                          required
                        />
                        <span className="text-slate-700">لا</span>
                      </label>
                    </div>
                  </div>

                  {/* Desired Domains - Career Aspirations */}
                  <div>
                    <label className="label">ما المجالات الوظيفية التي تشعر أنها الأقرب لتطلعاتك المهنية القادمة؟ ليس بالضرورة أن تكون امتدادً لمهنتك الحالية.</label>
                    
                    {loadingDomains ? (
                      <div className="flex justify-center items-center py-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700"></div>
                      </div>
                    ) : domains.length === 0 ? (
                      <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-slate-500">لا توجد مجالات متاحة حالياً</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
                        {domains.map((domain) => {
                          const isSelected = (employeeProfile.desired_domains || []).includes(domain.id);
                          return (
                            <label
                              key={domain.id}
                              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-primary-50 border-primary-400 shadow-sm'
                                  : 'bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setEmployeeProfile(prev => {
                                    const currentDomains = prev.desired_domains || [];
                                    if (currentDomains.includes(domain.id)) {
                                      return {
                                        ...prev,
                                        desired_domains: currentDomains.filter(id => id !== domain.id)
                                      };
                                    } else {
                                      return {
                                        ...prev,
                                        desired_domains: [...currentDomains, domain.id]
                                      };
                                    }
                                  });
                                }}
                                className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                              />
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: domain.color || '#502390' }}
                              />
                              <div className="flex-1">
                                <span className={`font-medium ${isSelected ? 'text-primary-700' : 'text-slate-800'}`}>
                                  {domain.name_ar}
                                </span>
                                {domain.name_en && (
                                  <span className="text-sm text-slate-500 mr-2">({domain.name_en})</span>
                                )}
                                {domain.description_ar && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{domain.description_ar}</p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    
                    {(employeeProfile.desired_domains || []).length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm text-primary-600 font-medium mb-2">
                          المجالات المختارة: {employeeProfile.desired_domains.length}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(employeeProfile.desired_domains || []).map(domainId => {
                            const domain = domains.find(d => d.id === domainId);
                            return domain ? (
                              <span
                                key={domainId}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
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
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmployeeProfile(prev => ({
                                      ...prev,
                                      desired_domains: (prev.desired_domains || []).filter(id => id !== domainId)
                                    }));
                                  }}
                                  className="hover:opacity-70 font-bold"
                                >
                                  ×
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center gap-4 pt-4 border-t">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="btn btn-primary"
                    >
                      {savingProfile ? 'جاري الحفظ...' : 'حفظ الملف الشخصي'}
                    </button>
                    <p className="text-sm text-slate-500">* حقول إلزامية</p>
                  </div>
                </form>
              )}
            </motion.div>
          )}

          {/* CV Import Tab */}
          {activeTab === 'cv-import' && user?.role === 'employee' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6"
            >
              <h2 className="text-lg font-semibold text-primary-700 mb-6">استيراد من السيرة الذاتية</h2>
              
              <div className="space-y-6">
                {/* Upload Section */}
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-primary-400 transition-colors">
                  <DocumentArrowUpIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">رفع السيرة الذاتية</h3>
                  <p className="text-slate-500 mb-4">
                    قم برفع سيرتك الذاتية لاستخراج المهارات والخبرات تلقائياً
                  </p>
                  <p className="text-sm text-slate-400 mb-6">
                    الصيغ المدعومة: PDF, DOC, DOCX (حد أقصى 5 ميجابايت)
                  </p>
                  <button
                    onClick={() => setShowCVModal(true)}
                    className="btn btn-primary"
                  >
                    رفع السيرة الذاتية
                  </button>
                </div>

                {/* Import History */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-800">سجل الاستيراد</h3>
                    {cvImportHistory.length > 0 && (
                      <button
                        onClick={() => setShowDeleteCVModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-danger-600 hover:text-danger-700 hover:bg-danger-50 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                        حذف السيرة الذاتية
                      </button>
                    )}
                  </div>
                  {loadingHistory ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-slate-500">جاري التحميل...</p>
                    </div>
                  ) : cvImportHistory.length > 0 ? (
                    <div className="space-y-2">
                      {cvImportHistory.map((importRecord) => (
                        <div
                          key={importRecord.id}
                          className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-slate-800">{importRecord.file_name}</p>
                              <p className="text-sm text-slate-500">
                                {new Date(importRecord.created_at).toLocaleDateString('ar-SA', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-primary-700">
                                {importRecord.imported_skills_count} مهارة
                              </p>
                              <span className={`text-xs px-2 py-1 rounded ${
                                importRecord.status === 'completed' 
                                  ? 'bg-success-100 text-success-700'
                                  : 'bg-warning-100 text-warning-700'
                              }`}>
                                {importRecord.status === 'completed' ? 'مكتمل' : importRecord.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <p className="text-sm">لا توجد سجلات استيراد</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6"
            >
              <h2 className="text-lg font-semibold text-primary-700 mb-6">تغيير كلمة المرور</h2>
              
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="label">كلمة المرور الحالية</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
                
                <div>
                  <label className="label">كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
                
                <div>
                  <label className="label">تأكيد كلمة المرور الجديدة</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="btn btn-primary"
                >
                  {changingPassword ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
                </button>
              </form>
            </motion.div>
          )}
        </div>
      </div>

      {/* CV Import Modal */}
      <CVImportModal
        isOpen={showCVModal}
        onClose={() => setShowCVModal(false)}
        onSuccess={handleCVImportSuccess}
      />

      {/* Delete CV Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteCVModal}
        onClose={() => setShowDeleteCVModal(false)}
        onConfirm={handleDeleteCV}
        title="حذف السيرة الذاتية"
        message="هل أنت متأكد من حذف السيرة الذاتية؟ سيتم حذف جميع المهارات والخبرات والشهادات المستوردة من السيرة الذاتية. لا يمكن التراجع عن هذا الإجراء."
        confirmText={deletingCV ? 'جاري الحذف...' : 'حذف'}
        cancelText="إلغاء"
      />
    </div>
  );
}

