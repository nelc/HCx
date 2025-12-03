import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { getRoleLabel, getInitials, formatDate } from '../utils/helpers';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
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
  });

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
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

  const openCreateModal = () => {
    setEditingUser(null);
    setForm({
      email: '',
      password: '',
      name_ar: '',
      name_en: '',
      role: 'employee',
      department_id: '',
      job_title_ar: '',
      job_title_en: '',
      employee_number: '',
    });
    setShowModal(true);
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

  const handleDelete = async (user) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.name_ar}"؟`)) return;
    
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('تم حذف المستخدم بنجاح');
      fetchUsers();
    } catch (error) {
      toast.error('فشل في حذف المستخدم');
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
        <button onClick={openCreateModal} className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          إضافة مستخدم
        </button>
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
                  <th>آخر دخول</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-medium">
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
                    <td className="text-slate-500 text-sm">
                      {user.last_login ? formatDate(user.last_login) : 'لم يسجل دخول'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
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
                ))}
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
    </div>
  );
}

