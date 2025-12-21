import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  BuildingOffice2Icon,
  RectangleGroupIcon,
  UsersIcon,
  ChevronLeftIcon,
  SparklesIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import DomainGeneratorModal from '../components/DomainGeneratorModal';

export default function Departments() {
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalType, setModalType] = useState('sector'); // 'sector', 'department', 'section'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showDomainGenerator, setShowDomainGenerator] = useState(false);
  const [selectedDepartmentForDomains, setSelectedDepartmentForDomains] = useState(null);
  const [form, setForm] = useState({
    name_ar: '',
    type: 'sector',
    parent_id: '',
    objective_ar: '',
    objective_en: '',
    responsibilities: [],
  });

  useEffect(() => {
    fetchAllItems();
  }, []);

  const fetchAllItems = async () => {
    try {
      const response = await api.get('/departments');
      setAllItems(response.data || []);
    } catch (error) {
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const sectors = allItems.filter(item => item.type === 'sector');
  const departments = allItems.filter(item => item.type === 'department');
  const sections = allItems.filter(item => item.type === 'section');

  const openCreateModal = (type, parentId = null) => {
    setEditingItem(null);
    setModalType(type);
    setForm({
      name_ar: '',
      type: type,
      parent_id: parentId || '',
      objective_ar: '',
      objective_en: '',
      responsibilities: [],
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setModalType(item.type);
    setForm({
      name_ar: item.name_ar,
      type: item.type,
      parent_id: item.parent_id || '',
      objective_ar: item.objective_ar || '',
      objective_en: item.objective_en || '',
      responsibilities: item.responsibilities || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.name_ar || !form.name_ar.trim()) {
      toast.error('الرجاء إدخال الاسم');
      return;
    }
    
    // Validate hierarchy requirements
    if (modalType === 'department' && !form.parent_id) {
      toast.error('يجب اختيار قطاع للإدارة');
      return;
    }
    
    if (modalType === 'section' && !form.parent_id) {
      toast.error('يجب اختيار إدارة للقسم');
      return;
    }
    
    try {
      const data = { 
        name_ar: form.name_ar.trim(),
        type: modalType,
        parent_id: form.parent_id && form.parent_id !== '' ? form.parent_id : null,
        objective_ar: form.objective_ar?.trim() || null,
        objective_en: form.objective_en?.trim() || null,
        responsibilities: form.responsibilities || [],
      };
      
      // Ensure sector has no parent
      if (modalType === 'sector') {
        data.parent_id = null;
      }
      
      if (editingItem) {
        await api.put(`/departments/${editingItem.id}`, data);
        toast.success('تم التحديث بنجاح');
      } else {
        await api.post('/departments', data);
        toast.success('تم الإنشاء بنجاح');
      }
      setShowModal(false);
      fetchAllItems();
    } catch (error) {
      console.error('Department save error:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.response?.data?.errors?.[0]?.msg ||
                          error.message ||
                          'فشل في الحفظ';
      toast.error(errorMessage);
    }
  };

  const handleDelete = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      await api.delete(`/departments/${itemToDelete.id}`);
      toast.success('تم الحذف بنجاح');
      fetchAllItems();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في الحذف');
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const addResponsibility = () => {
    setForm({
      ...form,
      responsibilities: [...form.responsibilities, { text_ar: '', text_en: '' }]
    });
  };

  const updateResponsibility = (index, field, value) => {
    const updated = [...form.responsibilities];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, responsibilities: updated });
  };

  const removeResponsibility = (index) => {
    const updated = form.responsibilities.filter((_, i) => i !== index);
    setForm({ ...form, responsibilities: updated });
  };

  const openDomainGenerator = (dept) => {
    if (!dept.objective_ar && !dept.objective_en && 
        (!dept.responsibilities || dept.responsibilities.length === 0)) {
      toast.error('يجب تحديد الهدف أو المسؤوليات أولاً قبل توليد المجالات');
      return;
    }
    setSelectedDepartmentForDomains(dept);
    setShowDomainGenerator(true);
  };

  const getModalTitle = () => {
    if (editingItem) {
      return modalType === 'sector' ? 'تعديل القطاع' : 
             modalType === 'department' ? 'تعديل الإدارة' : 'تعديل القسم';
    }
    return modalType === 'sector' ? 'إضافة قطاع جديد' : 
           modalType === 'department' ? 'إضافة إدارة جديدة' : 'إضافة قسم جديد';
  };

  const getPlaceholder = () => {
    return modalType === 'sector' ? 'مثال: قطاع الموارد البشرية' : 
           modalType === 'department' ? 'مثال: إدارة التوظيف' : 'مثال: قسم الاستقطاب';
  };

  const getParentOptions = () => {
    if (modalType === 'department') {
      return sectors.filter(s => s.id !== editingItem?.id);
    } else if (modalType === 'section') {
      return departments.filter(d => d.id !== editingItem?.id);
    }
    return [];
  };

  const getParentLabel = () => {
    return modalType === 'department' ? 'القطاع' : 'الإدارة';
  };

  const hasObjectiveOrResponsibilities = (item) => {
    return item.objective_ar || item.objective_en || 
           (item.responsibilities && item.responsibilities.length > 0);
  };

  const SectorCard = ({ sector }) => {
    const sectorDepts = departments.filter(d => d.parent_id === sector.id);
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 group"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <BuildingOfficeIcon className="w-6 h-6 text-primary-700" />
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => openEditModal(sector)}
              className="p-2 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(sector)}
              className="p-2 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <h3 className="font-bold text-lg text-slate-800 mb-2">{sector.name_ar}</h3>
        
        {sector.objective_ar && (
          <p className="text-sm text-slate-600 mb-2 line-clamp-2">{sector.objective_ar}</p>
        )}
        
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
          <div className="flex items-center gap-1">
            <BuildingOffice2Icon className="w-4 h-4" />
            <span>{sectorDepts.length} إدارة</span>
          </div>
          <div className="flex items-center gap-1">
            <UsersIcon className="w-4 h-4" />
            <span>{sector.employee_count || 0} موظف</span>
          </div>
          {hasObjectiveOrResponsibilities(sector) && (
            <div className="flex items-center gap-1 text-success-600">
              <DocumentTextIcon className="w-4 h-4" />
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => openCreateModal('department', sector.id)}
            className="flex-1 py-2 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors flex items-center justify-center gap-1"
            title="إضافة إدارة جديدة في هذا القطاع"
          >
            <PlusIcon className="w-4 h-4" />
            إضافة إدارة
          </button>
          {hasObjectiveOrResponsibilities(sector) && (
            <button
              onClick={() => openDomainGenerator(sector)}
              className="py-2 px-3 text-sm text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-lg transition-colors flex items-center gap-1"
              title="توليد المجالات والمهارات"
            >
              <SparklesIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const DepartmentCard = ({ department }) => {
    const deptSections = sections.filter(s => s.parent_id === department.id);
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5 group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 bg-accent-100 rounded-lg flex items-center justify-center">
            <BuildingOffice2Icon className="w-5 h-5 text-accent-700" />
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => openEditModal(department)}
              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(department)}
              className="p-1.5 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <h4 className="font-semibold text-slate-800 mb-1">{department.name_ar}</h4>
        {department.parent_name_ar && (
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <ChevronLeftIcon className="w-3 h-3" />
            {department.parent_name_ar}
          </p>
        )}
        
        {department.objective_ar && (
          <p className="text-xs text-slate-600 mb-2 line-clamp-2">{department.objective_ar}</p>
        )}
        
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
          <div className="flex items-center gap-1">
            <RectangleGroupIcon className="w-3.5 h-3.5" />
            <span>{deptSections.length} قسم</span>
          </div>
          <div className="flex items-center gap-1">
            <UsersIcon className="w-3.5 h-3.5" />
            <span>{department.employee_count || 0} موظف</span>
          </div>
          {hasObjectiveOrResponsibilities(department) && (
            <div className="flex items-center gap-1 text-success-600">
              <DocumentTextIcon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => openCreateModal('section', department.id)}
            className="flex-1 py-1.5 text-xs text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-lg transition-colors flex items-center justify-center gap-1"
            title="إضافة قسم جديد في هذه الإدارة"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            إضافة قسم
          </button>
          {hasObjectiveOrResponsibilities(department) && (
            <button
              onClick={() => openDomainGenerator(department)}
              className="py-1.5 px-2 text-xs text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded-lg transition-colors flex items-center gap-1"
              title="توليد المجالات والمهارات"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const SectionCard = ({ section }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
          <RectangleGroupIcon className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => openEditModal(section)}
            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100 rounded-lg"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDelete(section)}
            className="p-1.5 text-slate-400 hover:text-danger-600 hover:bg-slate-100 rounded-lg"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <h5 className="font-semibold text-sm text-slate-800 mb-1">{section.name_ar}</h5>
      {section.parent_name_ar && (
        <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
          <ChevronLeftIcon className="w-3 h-3" />
          {section.parent_name_ar}
        </p>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <UsersIcon className="w-3.5 h-3.5" />
          <span>{section.employee_count || 0} موظف</span>
        </div>
        {hasObjectiveOrResponsibilities(section) && (
          <button
            onClick={() => openDomainGenerator(section)}
            className="p-1 text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded"
            title="توليد المجالات والمهارات"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">الهيكل التنظيمي</h1>
          <p className="text-slate-500">إدارة القطاعات والإدارات والأقسام</p>
        </div>
        <button onClick={() => openCreateModal('sector')} className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          إضافة قطاع
        </button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-32 mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-6">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Sectors Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <BuildingOfficeIcon className="w-5 h-5 text-primary-600" />
                القطاعات
                <span className="text-sm font-normal text-slate-400">({sectors.length})</span>
              </h2>
            </div>
            
            {sectors.length === 0 ? (
              <div className="card p-8 text-center">
                <BuildingOfficeIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-700 mb-2">لا توجد قطاعات</h3>
                <p className="text-sm text-slate-500 mb-3">ابدأ بإنشاء أول قطاع في النظام</p>
                <button onClick={() => openCreateModal('sector')} className="btn btn-primary btn-sm inline-flex">
                  <PlusIcon className="w-4 h-4" />
                  إضافة قطاع
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sectors.map((sector) => (
                  <SectorCard key={sector.id} sector={sector} />
                ))}
              </div>
            )}
          </div>

          {/* Departments Section */}
          {sectors.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                  <BuildingOffice2Icon className="w-5 h-5 text-accent-600" />
                  الإدارات
                  <span className="text-sm font-normal text-slate-400">({departments.length})</span>
                </h2>
              </div>
              
              {departments.length === 0 ? (
                <div className="card p-6 text-center">
                  <BuildingOffice2Icon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-2">لا توجد إدارات.</p>
                  <p className="text-xs text-slate-400">قم بإضافة إدارة من بطاقة القطاع أعلاه.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {departments.map((dept) => (
                    <DepartmentCard key={dept.id} department={dept} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-6 text-center border-2 border-dashed border-slate-200">
              <BuildingOffice2Icon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-2">لا يمكن إضافة إدارات بدون قطاعات</p>
              <p className="text-xs text-slate-400">يجب إنشاء قطاع أولاً قبل إضافة إدارة</p>
            </div>
          )}

          {/* Sections Section */}
          {departments.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                  <RectangleGroupIcon className="w-5 h-5 text-slate-600" />
                  الأقسام
                  <span className="text-sm font-normal text-slate-400">({sections.length})</span>
                </h2>
              </div>
              
              {sections.length === 0 ? (
                <div className="card p-6 text-center">
                  <RectangleGroupIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-2">لا توجد أقسام.</p>
                  <p className="text-xs text-slate-400">قم بإضافة قسم من بطاقة الإدارة أعلاه.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {sections.map((section) => (
                    <SectionCard key={section.id} section={section} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-6 text-center border-2 border-dashed border-slate-200">
              <RectangleGroupIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-2">لا يمكن إضافة أقسام بدون إدارات</p>
              <p className="text-xs text-slate-400">يجب إنشاء إدارة أولاً قبل إضافة قسم</p>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              {getModalTitle()}
            </Dialog.Title>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">الاسم بالعربية *</label>
                <input
                  type="text"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  className="input"
                  placeholder={getPlaceholder()}
                  required
                />
              </div>
              
              {modalType !== 'sector' && (
                <div>
                  <label className="label">{getParentLabel()} *</label>
                  <select
                    value={form.parent_id || ''}
                    onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                    className="input"
                    required
                    disabled={getParentOptions().length === 0}
                  >
                    <option value="">
                      {getParentOptions().length === 0 
                        ? `لا توجد ${modalType === 'department' ? 'قطاعات' : 'إدارات'} متاحة` 
                        : `اختر ${getParentLabel()}`}
                    </option>
                    {getParentOptions().map(item => (
                      <option key={item.id} value={item.id}>{item.name_ar}</option>
                    ))}
                  </select>
                  {getParentOptions().length === 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {modalType === 'department' 
                        ? 'يجب إنشاء قطاع أولاً قبل إضافة إدارة'
                        : 'يجب إنشاء إدارة أولاً قبل إضافة قسم'}
                    </p>
                  )}
                </div>
              )}

              {/* Objective Section */}
              <div className="border-t border-slate-100 pt-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-primary-600" />
                  الهدف الرئيسي
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="label">الهدف بالعربية</label>
                    <textarea
                      value={form.objective_ar}
                      onChange={(e) => setForm({ ...form, objective_ar: e.target.value })}
                      className="input resize-none"
                      rows={3}
                      placeholder="أدخل الهدف الرئيسي لهذه الوحدة التنظيمية..."
                    />
                  </div>
                  <div>
                    <label className="label">الهدف بالإنجليزية</label>
                    <textarea
                      value={form.objective_en}
                      onChange={(e) => setForm({ ...form, objective_en: e.target.value })}
                      className="input resize-none"
                      rows={3}
                      placeholder="Enter the main objective..."
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Responsibilities Section */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5 text-accent-600" />
                    المسؤوليات ({form.responsibilities.length})
                  </h3>
                  <button
                    type="button"
                    onClick={addResponsibility}
                    className="btn btn-secondary btn-sm"
                  >
                    <PlusIcon className="w-4 h-4" />
                    إضافة مسؤولية
                  </button>
                </div>
                
                {form.responsibilities.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-lg">
                    <DocumentTextIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">لا توجد مسؤوليات مضافة</p>
                    <button
                      type="button"
                      onClick={addResponsibility}
                      className="text-sm text-primary-600 hover:text-primary-700 mt-2"
                    >
                      + إضافة أول مسؤولية
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {form.responsibilities.map((resp, index) => (
                      <div key={index} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-slate-500">
                            المسؤولية {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeResponsibility(index)}
                            className="p-1 text-slate-400 hover:text-danger-500 rounded"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={resp.text_ar || ''}
                            onChange={(e) => updateResponsibility(index, 'text_ar', e.target.value)}
                            className="input text-sm"
                            placeholder="المسؤولية بالعربية..."
                          />
                          <input
                            type="text"
                            value={resp.text_en || ''}
                            onChange={(e) => updateResponsibility(index, 'text_en', e.target.value)}
                            className="input text-sm"
                            placeholder="Responsibility in English..."
                            dir="ltr"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingItem ? 'حفظ التغييرات' : 'إنشاء'}
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
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message={itemToDelete ? (() => {
          const typeName = itemToDelete.type === 'sector' ? 'القطاع' : itemToDelete.type === 'department' ? 'الإدارة' : 'القسم';
          return `هل أنت متأكد من حذف ${typeName} "${itemToDelete.name_ar}"؟\n\nلا يمكن التراجع عن هذا الإجراء.`;
        })() : ''}
      />

      {/* Domain Generator Modal */}
      <DomainGeneratorModal
        isOpen={showDomainGenerator}
        onClose={() => {
          setShowDomainGenerator(false);
          setSelectedDepartmentForDomains(null);
        }}
        department={selectedDepartmentForDomains}
      />
    </div>
  );
}
