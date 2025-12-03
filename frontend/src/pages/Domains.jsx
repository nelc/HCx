import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  FolderIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const colorOptions = [
  '#0e395e', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'
];

export default function Domains() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState(null);
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    color: '#0e395e',
  });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains?include_stats=true');
      setDomains(response.data || []);
    } catch (error) {
      toast.error('فشل في تحميل المجالات');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingDomain(null);
    setForm({
      name_ar: '',
      name_en: '',
      description_ar: '',
      description_en: '',
      color: '#0e395e',
    });
    setShowModal(true);
  };

  const openEditModal = (domain) => {
    setEditingDomain(domain);
    setForm({
      name_ar: domain.name_ar,
      name_en: domain.name_en,
      description_ar: domain.description_ar || '',
      description_en: domain.description_en || '',
      color: domain.color || '#0e395e',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.name_ar) {
      toast.error('الرجاء إدخال اسم المجال');
      return;
    }
    
    try {
      if (editingDomain) {
        await api.put(`/domains/${editingDomain.id}`, form);
        toast.success('تم تحديث المجال بنجاح');
      } else {
        await api.post('/domains', form);
        toast.success('تم إنشاء المجال بنجاح');
      }
      setShowModal(false);
      fetchDomains();
    } catch (error) {
      toast.error('فشل في حفظ المجال');
    }
  };

  const handleDelete = async (domain) => {
    if (!confirm(`هل أنت متأكد من حذف مجال "${domain.name_ar}"؟`)) return;
    
    try {
      await api.delete(`/domains/${domain.id}`);
      toast.success('تم حذف المجال بنجاح');
      fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حذف المجال');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">مجالات التدريب</h1>
          <p className="text-slate-500">إدارة مجالات التدريب والمهارات</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          إضافة مجال
        </button>
      </div>

      {/* Domains grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد مجالات</h3>
          <p className="text-slate-500 mb-4">ابدأ بإنشاء أول مجال تدريبي</p>
          <button onClick={openCreateModal} className="btn btn-primary inline-flex">
            <PlusIcon className="w-5 h-5" />
            إضافة مجال
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {domains.map((domain, index) => (
            <motion.div
              key={domain.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card overflow-hidden group"
            >
              <div className="h-2" style={{ backgroundColor: domain.color || '#0e395e' }}></div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: (domain.color || '#0e395e') + '20' }}
                  >
                    <FolderIcon 
                      className="w-6 h-6"
                      style={{ color: domain.color || '#0e395e' }}
                    />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(domain)}
                      className="p-2 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(domain)}
                      className="p-2 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <h3 className="font-semibold text-slate-800 mb-1">{domain.name_ar}</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                  {domain.description_ar || 'لا يوجد وصف'}
                </p>
                
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <TagIcon className="w-4 h-4" />
                    {domain.skills_count || 0} مهارة
                  </span>
                  <span>{domain.tests_count || 0} تقييم</span>
                </div>
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
              {editingDomain ? 'تعديل المجال' : 'إضافة مجال جديد'}
            </Dialog.Title>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">الاسم بالعربية *</label>
                <input
                  type="text"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  className="input"
                  placeholder="مثال: إدارة المشاريع"
                />
              </div>
              
              <div>
                <label className="label">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="input"
                  placeholder="e.g. Project Management"
                  dir="ltr"
                />
              </div>
              
              <div>
                <label className="label">الوصف بالعربية</label>
                <textarea
                  value={form.description_ar}
                  onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                  className="input resize-none"
                  rows={3}
                  placeholder="وصف مختصر للمجال"
                />
              </div>
              
              <div>
                <label className="label">اللون</label>
                <div className="flex gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-8 h-8 rounded-lg transition-transform ${form.color === color ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
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
                  {editingDomain ? 'حفظ التغييرات' : 'إنشاء المجال'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}

