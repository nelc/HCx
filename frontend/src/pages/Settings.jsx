import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserCircleIcon,
  KeyIcon,
  BellIcon,
  GlobeAltIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api, { getCVImportHistory } from '../utils/api';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/helpers';
import CVImportModal from '../components/CVImportModal';

// Static skills data organized by subjects
const SKILLS_DATA = [
  {
    id: 'thinking',
    subject: 'التفكير والتحليل',
    color: 'bg-slate-600',
    skills: [
      'التحليل النقدي',
      'حل المشكلات',
      'اتخاذ القرار',
      'التفكير الاستراتيجي',
      'التحليل المنطقي',
    ],
  },
  {
    id: 'communication',
    subject: 'الاتصال',
    color: 'bg-blue-500',
    skills: [
      'التواصل الشفهي والكتابي',
      'إعداد التقارير',
      'العرض والإلقاء',
      'بناء العلاقات',
      'التفاوض',
    ],
  },
  {
    id: 'work-skills',
    subject: 'مهارات العمل',
    color: 'bg-indigo-500',
    skills: [
      'العمل الجماعي',
      'إدارة الوقت',
      'إدارة الأولويات',
      'الالتزام والانضباط',
      'التعلم السريع والتكيف',
    ],
  },
  {
    id: 'project-management',
    subject: 'إدارة المشاريع',
    color: 'bg-orange-500',
    skills: [
      'إدارة المشاريع (PMI / Agile / Scrum)',
      'إدارة النطاق والتكلفة والجودة',
      'إدارة المخاطر',
      'إدارة أصحاب المصلحة',
      'كتابة خطط المشاريع',
      'إدارة الجدولة (Gantt, Critical Path)',
      'مؤشرات الأداء للمشاريع (KPIs)',
      'إدارة PMO',
    ],
  },
  {
    id: 'finance',
    subject: 'المالية والمحاسبة',
    color: 'bg-yellow-500',
    skills: [
      'التحليل المالي',
      'إعداد الميزانيات',
      'التوقعات المالية',
      'التقارير المالية',
      'تحليل التكاليف',
      'إدارة النقد',
      'التدقيق الداخلي',
      'إدارة المخاطر المالية',
      'IFRS / SOCPA',
      'التسويات البنكية',
    ],
  },
  {
    id: 'tech',
    subject: 'التقنية والتحول الرقمي',
    color: 'bg-blue-600',
    skills: [
      'تطوير البرمجيات',
      'هندسة البنية المؤسسية',
      'أمن المعلومات',
      'إدارة قواعد البيانات',
      'إدارة الأنظمة',
      'إدارة الشبكات',
      'DevOps',
      'Cloud Computing',
      'تحليل الأنظمة',
      'هندسة الحلول',
      'اختبار البرمجيات QA',
      'إدارة المنتجات الرقمية',
    ],
  },
  {
    id: 'hr',
    subject: 'الموارد البشرية',
    color: 'bg-red-500',
    skills: [
      'تخطيط القوى العاملة',
      'الاستقطاب والاختيار',
      'إدارة الأداء',
      'التدريب والتطوير',
      'التعويضات والمزايا',
      'إدارة العلاقات العمالية',
      'الاستشارات الوظيفية',
      'تطوير القادة',
      'إدارة المواهب',
      'تحليل الوظائف والجدارات',
    ],
  },
  {
    id: 'procurement',
    subject: 'العقود والمشتريات',
    color: 'bg-purple-500',
    skills: [
      'إدارة سلسلة الإمداد',
      'إعداد العقود',
      'تحليل العروض',
      'التقييم الفني والمالي',
      'التفاوض التجاري',
      'اللائحة الموحدة للمشتريات الحكومية',
      'Vendor Management',
      'إدارة المناقصات',
      'التخطيط الشرائي',
    ],
  },
  {
    id: 'legal',
    subject: 'القانونية',
    color: 'bg-gray-600',
    skills: [
      'الصياغة القانونية',
      'المراجعة والامتثال',
      'تحليل المخاطر القانونية',
      'إعداد اللوائح والسياسات',
      'الترافع وحل النزاعات',
      'قانون العمل',
      'قانون الشركات',
      'الملكية الفكرية',
      'التعاقدات الحكومية',
      'حوكمة الأنظمة',
    ],
  },
  {
    id: 'data-ai',
    subject: 'البيانات والذكاء الاصطناعي',
    color: 'bg-green-500',
    skills: [
      'تحليل البيانات',
      'إدارة البيانات (Data Governance)',
      'تصور البيانات (Power BI / Tableau)',
      'النمذجة الإحصائية',
      'علم البيانات',
      'ML & AI Basics',
      'إدارة جودة البيانات',
      'بناء لوحات التحكم',
      'RAG / Vector Databases',
      'مهارات SQL / Python',
    ],
  },
  {
    id: 'warehouse',
    subject: 'المستودعات وسلاسل الإمداد',
    color: 'bg-amber-700',
    skills: [
      'إدارة المخزون',
      'التخطيط اللوجستي',
      'مراقبة الجودة',
      'إدارة دورة التوريد',
      'أنظمة المستودعات (WMS)',
      'التحسين المستمر',
    ],
  },
  {
    id: 'strategy',
    subject: 'التخطيط والاستراتيجية',
    color: 'bg-orange-600',
    skills: [
      'بناء الاستراتيجيات',
      'إدارة المبادرات والبرامج',
      'إدارة الأداء الاستراتيجي',
      'إعداد مؤشرات الأداء',
      'تحليل البيئة الداخلية والخارجية',
      'دراسات الجدوى',
      'إدارة المحافظ',
      'تحليل البيانات الاستراتيجية',
      'بناء تقارير المتابعة التنفيذية',
    ],
  },
  {
    id: 'business',
    subject: 'إدارة الأعمال والمنتجات',
    color: 'bg-sky-600',
    skills: [
      'نماذج الأعمال',
      'تحليل السوق',
      'إدارة المنتج Product Management',
      'تصميم تجربة المستخدم',
      'تحليل العملاء',
      'Journey Mapping',
      'قيادة التطوير',
      'دراسة المنافسين',
      'بناء عروض القيمة',
    ],
  },
  {
    id: 'sales',
    subject: 'المبيعات والعلاقات',
    color: 'bg-emerald-500',
    skills: [
      'مهارات البيع الاحترافي',
      'إدارة الحسابات (Account Management)',
      'الإقناع والتفاوض',
      'إدارة علاقات العملاء',
      'بناء شبكات العلاقات',
      'تحليل احتياجات العميل',
      'متابعة الصفقات والإغلاقات',
      'Customer Success',
    ],
  },
  {
    id: 'marketing',
    subject: 'التسويق والاتصال المؤسسي',
    color: 'bg-cyan-600',
    skills: [
      'التخطيط التسويقي',
      'المحتوى والإبداع',
      'إدارة الحملات',
      'السوشيال ميديا',
      'إدارة الهوية',
      'قياس الأثر التسويقي',
      'استراتيجيات العلامة التجارية',
    ],
  },
  {
    id: 'governance',
    subject: 'التحليل والحوكمة والجودة',
    color: 'bg-stone-600',
    skills: [
      'إدارة الجودة',
      'التحسين المستمر',
      'مراقبة الالتزام',
      'التوثيق وصنع السياسات',
      'إدارة المخاطر',
      'التدقيق الداخلي',
      'تقييم العمليات',
    ],
  },
  {
    id: 'leadership',
    subject: 'القيادة والإدارة',
    color: 'bg-violet-600',
    skills: [
      'اتخاذ القرار',
      'إدارة التغيير',
      'بناء فرق عالية الأداء',
      'التفكير الاستراتيجي',
      'إدارة الأزمات',
      'الحوكمة',
      'بناء الثقافة المؤسسية',
      'قيادة الابتكار',
    ],
  },
];

export default function Settings() {
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  
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
  });
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Fetch employee profile
  useEffect(() => {
    if (user?.role === 'employee' && activeTab === 'employee-profile') {
      fetchEmployeeProfile();
    }
  }, [activeTab, user]);

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
      await api.put('/users/profile/me', employeeProfile);
      toast.success('تم حفظ الملف الشخصي بنجاح');
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حفظ الملف الشخصي');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleSkillInterest = (subjectId, skillName) => {
    const skillKey = `${subjectId}:${skillName}`;
    setEmployeeProfile(prev => {
      const interests = prev.interests || [];
      if (interests.includes(skillKey)) {
        return { ...prev, interests: interests.filter(key => key !== skillKey) };
      } else {
        return { ...prev, interests: [...interests, skillKey] };
      }
    });
  };

  const isSkillSelected = (subjectId, skillName) => {
    const skillKey = `${subjectId}:${skillName}`;
    return (employeeProfile.interests || []).includes(skillKey);
  };

  const getSelectedCountForSubject = (subjectId) => {
    return (employeeProfile.interests || []).filter(key => key.startsWith(`${subjectId}:`)).length;
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
              
              <p className="text-sm text-slate-400 mt-6">
                للتعديل على بياناتك، يرجى التواصل مع مدير النظام
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

                  {/* Interests */}
                  <div>
                    <label className="label">الاهتمامات (المهارات والمواضيع) *</label>
                    <p className="text-sm text-slate-500 mb-3">اختر المجالات والمهارات التي تهتم بها</p>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto p-4 bg-slate-50 rounded-xl">
                      {SKILLS_DATA.map((subject) => {
                        const selectedCount = getSelectedCountForSubject(subject.id);
                        const isExpanded = expandedSubjects[subject.id];
                        
                        return (
                          <div key={subject.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* Subject Header */}
                            <button
                              type="button"
                              onClick={() => toggleSubjectExpand(subject.id)}
                              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${subject.color}`}></div>
                                <span className="font-semibold text-slate-800">{subject.subject}</span>
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {subject.skills.map((skill, skillIndex) => (
                                        <label
                                          key={skillIndex}
                                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                            isSkillSelected(subject.id, skill)
                                              ? 'bg-primary-50 border-primary-400'
                                              : 'bg-slate-50 border-slate-200 hover:border-primary-300'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSkillSelected(subject.id, skill)}
                                            onChange={() => toggleSkillInterest(subject.id, skill)}
                                            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                                          />
                                          <span className={`text-sm ${isSkillSelected(subject.id, skill) ? 'text-primary-700 font-medium' : 'text-slate-700'}`}>
                                            {skill}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                    {employeeProfile.interests?.length > 0 && (
                      <p className="text-sm text-primary-600 mt-2">
                        تم اختيار {employeeProfile.interests.length} مهارة/مهارات
                      </p>
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
                  <h3 className="font-semibold text-slate-800 mb-4">سجل الاستيراد</h3>
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
    </div>
  );
}

