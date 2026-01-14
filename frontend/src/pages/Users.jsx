import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowUpTrayIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api, { uploadUsersCSV } from '../utils/api';
import { getRoleLabel, getInitials, formatDate } from '../utils/helpers';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  
  // Invitation state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    name_ar: '',
    name_en: '',
    department_id: '',
    job_title_ar: '',
    employee_number: '',
    national_id: '',
  });
  
  const [form, setForm] = useState({
    email: '',
    password: '',
    name_ar: '',
    name_en: '',
    role: 'employee',
    department_id: '',
    job_title_ar: '',
    job_title_en: '',
    employee_number: '',
    national_id: '',
  });

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
    fetchInvitations();
  }, [filterRole, filterDepartment]);

  const fetchUsers = async () => {
    try {
      let url = '/users?';
      if (filterRole) url += `role=${filterRole}&`;
      if (filterDepartment) url += `department_id=${filterDepartment}`;
      
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

  const fetchInvitations = async () => {
    try {
      const response = await api.get('/invitations?status=pending');
      setInvitations(response.data.invitations || []);
    } catch (error) {
      console.error('Failed to fetch invitations');
    }
  };

  // Check if a user has a pending invitation
  const getPendingInvitation = (userId) => {
    return invitations.find(inv => inv.user_id === userId && inv.status === 'pending');
  };

  const openInviteModal = () => {
    setInviteForm({
      email: '',
      name_ar: '',
      name_en: '',
      department_id: '',
      job_title_ar: '',
      employee_number: '',
      national_id: '',
    });
    setShowInviteModal(true);
  };

  const openBulkModal = () => {
    setBulkFile(null);
    setBulkResult(null);
    setShowBulkModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: '',
      name_ar: user.name_ar,
      name_en: user.name_en,
      role: user.role,
      department_id: user.department_id || '',
      job_title_ar: user.job_title_ar || '',
      job_title_en: user.job_title_en || '',
      employee_number: user.employee_number || '',
      national_id: user.national_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.name_ar || !form.email) {
      toast.error('الرجاء ملء الحقول المطلوبة');
      return;
    }
    
    if (!editingUser && !form.password) {
      toast.error('الرجاء إدخال كلمة المرور');
      return;
    }
    
    try {
      const data = { ...form };
      if (!data.password) delete data.password;
      if (!data.department_id) data.department_id = null;
      
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, data);
        toast.success('تم تحديث المستخدم بنجاح');
      } else {
        await api.post('/users', data);
        toast.success('تم إنشاء المستخدم بنجاح');
      }
      setShowModal(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حفظ المستخدم');
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    
    if (!inviteForm.name_ar || !inviteForm.email) {
      toast.error('الرجاء ملء الحقول المطلوبة');
      return;
    }
    
    setInviting(true);
    
    try {
      const data = { ...inviteForm };
      if (!data.department_id) data.department_id = null;
      
      const response = await api.post('/invitations', data);
      
      if (response.data.invitation_sent) {
        toast.success('تم إرسال الدعوة بنجاح');
      } else {
        toast.success(response.data.message || 'تم إنشاء المستخدم');
      }
      
      setShowInviteModal(false);
      fetchUsers();
      fetchInvitations();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في إرسال الدعوة');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvitation = async (invitationId) => {
    setResendingId(invitationId);
    
    try {
      await api.post(`/invitations/${invitationId}/resend`);
      toast.success('تم إعادة إرسال الدعوة بنجاح');
      fetchInvitations();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في إعادة إرسال الدعوة');
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();

    if (!bulkFile) {
      toast.error('الرجاء اختيار ملف CSV');
      return;
    }

    setBulkUploading(true);
    try {
      const response = await uploadUsersCSV(bulkFile);
      const result = response.data;
      setBulkResult(result);
      
      // Show appropriate toast based on email sending results
      if (result.createdCount === 0) {
        toast.error('لم يتم إنشاء أي مستخدم. تحقق من البيانات في الملف.');
      } else if (result.invitationsSentCount === result.createdCount) {
        // All emails sent successfully
        toast.success(`تم إنشاء ${result.createdCount} مستخدم وإرسال جميع الدعوات بنجاح`);
      } else if (result.invitationsSentCount > 0 && result.invitationsFailedCount > 0) {
        // Some emails sent, some failed
        toast.success(`تم إنشاء ${result.createdCount} مستخدم`);
        toast.error(`فشل إرسال ${result.invitationsFailedCount} دعوة من أصل ${result.createdCount}`);
      } else if (result.invitationsFailedCount === result.createdCount) {
        // All emails failed
        toast.success(`تم إنشاء ${result.createdCount} مستخدم`);
        toast.error('فشل إرسال جميع الدعوات! تحقق من إعدادات البريد الإلكتروني.');
      } else {
        // Fallback
        toast.success('تم استيراد المستخدمين من الملف');
      }
      
      fetchUsers();
      fetchInvitations();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في استيراد الملف');
    } finally {
      setBulkUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    try {
      await api.delete(`/users/${userToDelete.id}`);
      toast.success('تم حذف المستخدم بنجاح');
      fetchUsers();
      fetchInvitations();
    } catch (error) {
      toast.error('فشل في حذف المستخدم');
    } finally {
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  };

  const filteredUsers = users.filter(user =>
    user.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
    user.name_en?.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase())
  );

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    training_officer: 'bg-blue-100 text-blue-700',
    employee: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">المستخدمون</h1>
          <p className="text-slate-500">إدارة حسابات المستخدمين والصلاحيات</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={openBulkModal}
            className="btn btn-secondary whitespace-nowrap"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            استيراد من CSV
          </button>
          <button onClick={openInviteModal} className="btn btn-primary whitespace-nowrap">
            <PlusIcon className="w-5 h-5" />
            إضافة مستخدم
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="البحث عن مستخدم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pr-10"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="input w-full sm:w-40"
          >
            <option value="">جميع الأدوار</option>
            <option value="admin">مدير النظام</option>
            <option value="training_officer">مسؤول التدريب</option>
            <option value="employee">موظف</option>
          </select>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="input w-full sm:w-48"
          >
            <option value="">جميع الأقسام</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <UserCircleIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">لا يوجد مستخدمين</h3>
            <p className="text-slate-500">لم يتم العثور على مستخدمين مطابقين</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الدور</th>
                  <th>القسم</th>
                  <th>المسمى الوظيفي</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const pendingInvitation = getPendingInvitation(user.id);
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                            user.is_active ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {getInitials(user.name_ar)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{user.name_ar}</p>
                            <p className="text-sm text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${roleColors[user.role]}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="text-slate-500">{user.department_name_ar || '-'}</td>
                      <td className="text-slate-500">{user.job_title_ar || '-'}</td>
                      <td>
                        {pendingInvitation ? (
                          <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1">
                            <ClockIcon className="w-3.5 h-3.5" />
                            دعوة معلقة
                          </span>
                        ) : user.is_active ? (
                          <span className="badge bg-emerald-100 text-emerald-700">نشط</span>
                        ) : (
                          <span className="badge bg-slate-100 text-slate-500">غير نشط</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {pendingInvitation && (
                            <button
                              onClick={() => handleResendInvitation(pendingInvitation.id)}
                              disabled={resendingId === pendingInvitation.id}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
                              title="إعادة إرسال الدعوة"
                            >
                              <ArrowPathIcon className={`w-4 h-4 ${resendingId === pendingInvitation.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="p-2 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              {editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
            </Dialog.Title>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">الاسم بالعربية *</label>
                  <input
                    type="text"
                    value={form.name_ar}
                    onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <label className="label">البريد الإلكتروني *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                  dir="ltr"
                  disabled={!!editingUser}
                />
              </div>
              
              <div>
                <label className="label">
                  كلمة المرور {editingUser ? '(اتركها فارغة للحفاظ على الحالية)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                  dir="ltr"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">الدور *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="input"
                  >
                    <option value="employee">موظف</option>
                    <option value="training_officer">مسؤول التدريب</option>
                    <option value="admin">مدير النظام</option>
                  </select>
                </div>
                <div>
                  <label className="label">القسم</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    className="input"
                  >
                    <option value="">بدون قسم</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={form.job_title_ar}
                    onChange={(e) => setForm({ ...form, job_title_ar: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">الرقم الوظيفي</label>
                  <input
                    type="text"
                    value={form.employee_number}
                    onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="label">رقم الهوية الوطنية</label>
                <input
                  type="text"
                  value={form.national_id}
                  onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                  className="input"
                  dir="ltr"
                  placeholder="أدخل رقم الهوية الوطنية"
                />
                <p className="text-xs text-slate-500 mt-1">
                  هذا الرقم هو المعرّف الرئيسي للمتدرب ولا يمكن للمستخدم تغييره
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingUser ? 'حفظ التغييرات' : 'إنشاء المستخدم'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Invite User Modal */}
      <Dialog open={showInviteModal} onClose={() => setShowInviteModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              إضافة مستخدم جديد
            </Dialog.Title>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-700">
                سيتم إرسال رسالة بريد إلكتروني للمستخدم تحتوي على رابط لإنشاء كلمة المرور الخاصة به وتفعيل حسابه.
              </p>
            </div>
            
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">الاسم بالعربية *</label>
                  <input
                    type="text"
                    value={inviteForm.name_ar}
                    onChange={(e) => setInviteForm({ ...inviteForm, name_ar: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">الاسم بالإنجليزية</label>
                  <input
                    type="text"
                    value={inviteForm.name_en}
                    onChange={(e) => setInviteForm({ ...inviteForm, name_en: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <label className="label">البريد الإلكتروني *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="input"
                  dir="ltr"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">القسم</label>
                  <select
                    value={inviteForm.department_id}
                    onChange={(e) => setInviteForm({ ...inviteForm, department_id: e.target.value })}
                    className="input"
                  >
                    <option value="">بدون قسم</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">الرقم الوظيفي</label>
                  <input
                    type="text"
                    value={inviteForm.employee_number}
                    onChange={(e) => setInviteForm({ ...inviteForm, employee_number: e.target.value })}
                    className="input"
                    dir="ltr"
                  />
                </div>
              </div>
              
              <div>
                <label className="label">المسمى الوظيفي</label>
                <input
                  type="text"
                  value={inviteForm.job_title_ar}
                  onChange={(e) => setInviteForm({ ...inviteForm, job_title_ar: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="label">رقم الهوية الوطنية *</label>
                <input
                  type="text"
                  value={inviteForm.national_id}
                  onChange={(e) => setInviteForm({ ...inviteForm, national_id: e.target.value })}
                  className="input"
                  dir="ltr"
                  placeholder="أدخل رقم الهوية الوطنية"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  هذا الرقم هو المعرّف الرئيسي للمتدرب ولا يمكن للمستخدم تغييره بعد ذلك
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={inviting}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1"
                  disabled={inviting}
                >
                  {inviting ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>جاري الإرسال...</span>
                    </div>
                  ) : (
                    <>
                      <EnvelopeIcon className="w-5 h-5" />
                      إرسال الدعوة
                    </>
                  )}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Bulk Upload Modal */}
      <Dialog open={showBulkModal} onClose={() => setShowBulkModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              استيراد المستخدمين من ملف CSV
            </Dialog.Title>

            <form onSubmit={handleBulkUpload} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-2">
                <p className="font-medium">تنسيق الأعمدة المطلوب (بالترتيب):</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>الرقم الوظيفي</li>
                  <li>الاسم بالعربية <span className="text-danger-600">*</span></li>
                  <li>الاسم بالإنجليزية</li>
                  <li>الايميل <span className="text-danger-600">*</span></li>
                  <li>رقم الهوية الوطنية <span className="text-danger-600">*</span></li>
                  <li>القسم (نفس الاسم الموجود في النظام)</li>
                  <li>المسمى الوظيفي</li>
                </ul>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="text-danger-600">*</span> حقول مطلوبة
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <p>سيتم إرسال دعوة بالبريد الإلكتروني لكل مستخدم لإنشاء كلمة المرور الخاصة به وتفعيل حسابه.</p>
              </div>

              <div>
                <label className="label">ملف CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files[0] || null)}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="text-xs text-slate-500 mt-2">
                  تأكد أن الصف الأول يحتوي على عناوين الأعمدة كما هو موضح أعلاه، وأن الملف محفوظ بصيغة CSV.
                </p>
              </div>

              {bulkResult && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
                  <p className="font-medium text-slate-800">نتيجة الاستيراد:</p>
                  <p>إجمالي الصفوف: {bulkResult.totalRows}</p>
                  <p className="text-emerald-700">
                    تم إنشاء: {bulkResult.createdCount} مستخدم
                  </p>
                  
                  {/* Email Status - Always show when users were created */}
                  {bulkResult.createdCount > 0 && (
                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <p className="font-medium text-slate-700 mb-1">حالة إرسال الدعوات:</p>
                      <p className={bulkResult.invitationsSentCount > 0 ? "text-emerald-700" : "text-slate-500"}>
                        ✉️ تم الإرسال: {bulkResult.invitationsSentCount || 0} دعوة
                      </p>
                      <p className={bulkResult.invitationsFailedCount > 0 ? "text-danger-700 font-medium" : "text-slate-500"}>
                        ❌ فشل الإرسال: {bulkResult.invitationsFailedCount || 0} دعوة
                      </p>
                    </div>
                  )}
                  
                  {bulkResult.skippedCount > 0 && (
                    <p className="text-amber-700">
                      تم تخطي: {bulkResult.skippedCount} صف
                    </p>
                  )}
                  {bulkResult.errorCount > 0 && (
                    <p className="text-danger-700">
                      أخطاء: {bulkResult.errorCount} صف
                    </p>
                  )}
                  {(bulkResult.skipped?.length > 0 || bulkResult.errors?.length > 0 || bulkResult.invitationsFailed?.length > 0) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-primary-700 text-sm">
                        عرض التفاصيل
                      </summary>
                      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs">
                        {bulkResult.skipped?.map((row) => (
                          <div key={`skipped-${row.rowNumber}`} className="text-amber-700">
                            صف {row.rowNumber}: {row.reason}
                            {row.email && ` ( ${row.email} )`}
                          </div>
                        ))}
                        {bulkResult.errors?.map((row) => (
                          <div key={`error-${row.rowNumber}`} className="text-danger-700">
                            صف {row.rowNumber}: {row.error}
                            {row.email && ` ( ${row.email} )`}
                          </div>
                        ))}
                        {bulkResult.invitationsFailed?.map((row) => (
                          <div key={`inv-failed-${row.rowNumber}`} className="text-amber-700">
                            صف {row.rowNumber}: {row.error} ({row.email})
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={bulkUploading}
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={bulkUploading}
                >
                  {bulkUploading ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد حذف المستخدم"
        message={userToDelete ? `هل أنت متأكد من حذف المستخدم "${userToDelete.name_ar}"؟\n\nلا يمكن التراجع عن هذا الإجراء.` : ''}
      />
    </div>
  );
}
