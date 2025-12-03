import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    parent_id: '',
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data || []);
    } catch (error) {
      toast.error('فشل في تحميل الأقسام');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingDepartment(null);
    setForm({
      name_ar: '',
      name_en: '',
      description_ar: '',
      description_en: '',
      parent_id: '',
    });
    setShowModal(true);
  };

  const openEditModal = (department) => {
    setEditingDepartment(department);
    setForm({
      name_ar: department.name_ar,
      name_en: department.name_en,
      description_ar: department.description_ar || '',
      description_en: department.description_en || '',
      parent_id: department.parent_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.name_ar) {
      toast.error('الرجاء إدخال اسم القسم');
      return;
    }
    
    try {
      const data = { ...form };
      if (!data.parent_id) data.parent_id = null;
      
      if (editingDepartment) {
        await api.put(`/departments/${editingDepartment.id}`, data);
        toast.success('تم تحديث القسم بنجاح');
      } else {
        await api.post('/departments', data);
        toast.success('تم إنشاء القسم بنجاح');
      }
      setShowModal(false);
      fetchDepartments();
    } catch (error) {
      toast.error('فشل في حفظ القسم');
    }
  };

  const handleDelete = async (department) => {
    if (!confirm(`هل أنت متأكد من حذف قسم "${department.name_ar}"؟`)) return;
    
    try {
      await api.delete(`/departments/${department.id}`);
      toast.success('تم حذف القسم بنجاح');
      fetchDepartments();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حذف القسم');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">الأقسام</h1>
          <p className="text-slate-500">إدارة الهيكل التنظيمي</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          إضافة قسم
        </button>
      </div>

      {/* Departments list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="card p-12 text-center">
          <BuildingOfficeIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد أقسام</h3>
          <p className="text-slate-500 mb-4">ابدأ بإنشاء أول قسم</p>
          <button onClick={openCreateModal} className="btn btn-primary inline-flex">
            <PlusIcon className="w-5 h-5" />
            إضافة قسم
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((department, index) => (
            <motion.div
              key={department.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card p-6 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center">
                  <BuildingOfficeIcon className="w-6 h-6 text-primary-600" />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(department)}
                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(department)}
                    className="p-2 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <h3 className="font-semibold text-slate-800 mb-1">{department.name_ar}</h3>
              {department.parent_name_ar && (
                <p className="text-sm text-slate-400 mb-2">تابع لـ: {department.parent_name_ar}</p>
              )}
              <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                {department.description_ar || 'لا يوجد وصف'}
              </p>
              
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <UsersIcon className="w-4 h-4" />
                <span>{department.employee_count || 0} موظف</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              {editingDepartment ? 'تعديل القسم' : 'إضافة قسم جديد'}
            </Dialog.Title>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">الاسم بالعربية *</label>
                <input
                  type="text"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  className="input"
                  placeholder="مثال: قسم الموارد البشرية"
                />
              </div>
              
              <div>
                <label className="label">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="input"
                  placeholder="e.g. Human Resources"
                  dir="ltr"
                />
              </div>
              
              <div>
                <label className="label">القسم الرئيسي</label>
                <select
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="input"
                >
                  <option value="">بدون قسم رئيسي</option>
                  {departments
                    .filter(d => d.id !== editingDepartment?.id)
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
                    ))
                  }
                </select>
              </div>
              
              <div>
                <label className="label">الوصف</label>
                <textarea
                  value={form.description_ar}
                  onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                  className="input resize-none"
                  rows={3}
                  placeholder="وصف مختصر للقسم"
                />
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
                  {editingDepartment ? 'حفظ التغييرات' : 'إنشاء القسم'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}

