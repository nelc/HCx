import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  UserCircleIcon,
  KeyIcon,
  BellIcon,
  GlobeAltIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { getRoleLabel } from '../utils/helpers';

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
    interests: [],
    specialization_ar: '',
    specialization_en: '',
    last_qualification_ar: '',
    last_qualification_en: '',
    willing_to_change_career: null,
  });
  const [allSkills, setAllSkills] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Fetch employee profile
  useEffect(() => {
    if (user?.role === 'employee' && activeTab === 'employee-profile') {
      fetchEmployeeProfile();
      fetchSkills();
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

  const fetchSkills = async () => {
    try {
      const response = await api.get('/skills');
      setAllSkills(response.data);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    }
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

  const toggleSkillInterest = (skillId) => {
    setEmployeeProfile(prev => {
      const interests = prev.interests || [];
      if (interests.includes(skillId)) {
        return { ...prev, interests: interests.filter(id => id !== skillId) };
      } else {
        return { ...prev, interests: [...interests, skillId] };
      }
    });
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

  const tabs = [
    { id: 'profile', label: 'الملف الشخصي', icon: UserCircleIcon },
    ...(user?.role === 'employee' ? [{ id: 'employee-profile', label: 'ملف الموظف', icon: BriefcaseIcon }] : []),
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
              <h2 className="text-lg font-semibold text-primary-700 mb-6">ملف الموظف</h2>
              
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-4 bg-slate-50 rounded-xl">
                      {allSkills.length === 0 ? (
                        <p className="text-slate-400 col-span-2 text-center py-4">لا توجد مهارات متاحة</p>
                      ) : (
                        allSkills.map((skill) => (
                          <label
                            key={skill.id}
                            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-primary-400 cursor-pointer transition-all"
                          >
                            <input
                              type="checkbox"
                              checked={(employeeProfile.interests || []).includes(skill.id)}
                              onChange={() => toggleSkillInterest(skill.id)}
                              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-slate-800">{skill.name_ar}</div>
                              <div className="text-xs text-slate-500">{skill.domain_name_ar}</div>
                            </div>
                          </label>
                        ))
                      )}
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
                    <label className="label">هل أنت مستعد لتغيير مسارك الوظيفي؟ *</label>
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
    </div>
  );
}

