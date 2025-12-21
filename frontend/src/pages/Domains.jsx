import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  FolderIcon,
  TagIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

const colorOptions = [
  '#502390', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#EF4444', '#14B8A6'
];

export default function Domains() {
  const [domains, setDomains] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState(null);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    color: '#502390',
    skills: [], // initial skills for this domain
    department_ids: [], // departments trained on this domain
  });

  useEffect(() => {
    fetchDomains();
    fetchDepartments();
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

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data || []);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const openCreateModal = () => {
    setEditingDomain(null);
    setForm({
      name_ar: '',
      name_en: '',
      description_ar: '',
      description_en: '',
      color: '#502390',
      skills: [],
      department_ids: [],
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
      color: domain.color || '#502390',
      // Map existing skills (if any) to editable structure
      skills: Array.isArray(domain.skills)
        ? domain.skills.map((skill) => ({
            id: skill.id,
            name_ar: skill.name_ar || '',
            name_en: skill.name_en || '',
          }))
        : [],
      // Map existing departments to IDs
      department_ids: Array.isArray(domain.departments)
        ? domain.departments.map((dept) => dept.id)
        : [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.name_ar) {
      toast.error('الرجاء إدخال اسم المجال');
      return;
    }
  
  if (!form.name_en) {
    toast.error('الرجاء إدخال الاسم بالإنجليزية');
    return;
  }
    
    try {
      // Filter out empty skills before sending
      const validSkills = (form.skills || []).filter(s => s.name_ar && s.name_en);
      const dataToSend = { ...form, skills: validSkills };
      
      if (editingDomain) {
        await api.put(`/domains/${editingDomain.id}`, dataToSend);
        toast.success(`تم تحديث المجال بنجاح (${validSkills.length} مهارة)`);
      } else {
        await api.post('/domains', dataToSend);
        toast.success(`تم إنشاء المجال بنجاح (${validSkills.length} مهارة)`);
      }
      setShowModal(false);
      fetchDomains();
    } catch (error) {
      console.error('Save domain error:', error);
      toast.error(error.response?.data?.error || 'فشل في حفظ المجال');
    }
  };

  const handleDelete = (domain) => {
    setDomainToDelete(domain);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!domainToDelete) return;
    
    try {
      await api.delete(`/domains/${domainToDelete.id}`);
      toast.success('تم حذف المجال بنجاح');
      fetchDomains();
    } catch (error) {
      if (error.response?.data?.code === 'HAS_ASSOCIATED_TESTS') {
        toast.error('لايمكنك حذف مجال مرتبط باختبار، قم بحذف الاختبار أولا.');
      } else {
        toast.error(error.response?.data?.error || 'فشل في حذف المجال');
      }
    } finally {
      setShowDeleteModal(false);
      setDomainToDelete(null);
    }
  };

  const handleBulkFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'text/csv') {
      setUploadFile(file);
    } else {
      toast.error('الرجاء اختيار ملف CSV');
    }
  };

  const handleBulkUploadCSV = async () => {
    if (!uploadFile) {
      toast.error('الرجاء اختيار ملف');
      return;
    }

    const startTime = Date.now();

    try {
      setUploadProgress({ 
        status: 'uploading', 
        message: 'جاري رفع الملف...', 
        percent: 0,
        startTime
      });

      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await api.post('/domains/upload-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress({ 
            status: 'uploading', 
            message: 'جاري رفع الملف...', 
            percent: percentCompleted,
            startTime
          });
        }
      });

      const totalTime = Math.round((Date.now() - startTime) / 1000);
      
      const insertedCount = response.data.inserted || 0;
      const updatedCount = response.data.updated || 0;
      
      let message = `تم معالجة ${response.data.success} مجال بنجاح من أصل ${response.data.total}`;
      if (insertedCount > 0 && updatedCount > 0) {
        message = `تم إضافة ${insertedCount} مجال جديد وتحديث ${updatedCount} مجال موجود`;
      } else if (updatedCount > 0) {
        message = `تم تحديث ${updatedCount} مجال موجود`;
      } else if (insertedCount > 0) {
        message = `تم إضافة ${insertedCount} مجال جديد`;
      }
      
      setUploadProgress({ 
        status: 'completed', 
        message: message,
        details: response.data,
        percent: 100,
        totalTime
      });
      
      if (response.data.failed > 0) {
        toast.error(`فشل في معالجة ${response.data.failed} مجال`);
      } else {
        toast.success('تمت العملية بنجاح');
      }
      
      fetchDomains();
      
      setTimeout(() => {
        setShowBulkUploadModal(false);
        setUploadFile(null);
        setUploadProgress(null);
      }, 5000);
    } catch (error) {
      setUploadProgress({ 
        status: 'error', 
        message: error.response?.data?.error || 'فشل في رفع الملف',
        percent: 0
      });
      toast.error('فشل في رفع الملف');
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
        <div className="flex gap-3">
          <button
            onClick={() => setShowBulkUploadModal(true)}
            className="btn btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            رفع CSV
          </button>
          <button onClick={openCreateModal} className="btn btn-primary">
            <PlusIcon className="w-5 h-5" />
            إضافة مجال
          </button>
        </div>
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
          <p className="text-slate-500 mb-4">ابدأ بإنشاء أول مجال تدريبي أو قم برفع ملف CSV</p>
          <div className="flex gap-3 justify-center">
            <button onClick={openCreateModal} className="btn btn-primary inline-flex">
              <PlusIcon className="w-5 h-5" />
              إضافة مجال
            </button>
            <button onClick={() => setShowBulkUploadModal(true)} className="btn btn-secondary inline-flex">
              <ArrowUpTrayIcon className="w-5 h-5" />
              رفع CSV
            </button>
          </div>
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
              <div className="h-2" style={{ backgroundColor: domain.color || '#502390' }}></div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: (domain.color || '#502390') + '20' }}
                  >
                    <FolderIcon 
                      className="w-6 h-6"
                      style={{ color: domain.color || '#502390' }}
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
                    {parseInt(domain.skills_count) || 0} مهارة
                  </span>
                  <span>{parseInt(domain.tests_count) || 0} تقييم</span>
                </div>

                {Array.isArray(domain.skills) && domain.skills.length > 0 && (
                  <div className="mt-3 text-sm text-slate-600">
                    <span className="font-medium">المهارات:</span>{' '}
                    {domain.skills.map((skill) => skill.name_ar).join('، ')}
                  </div>
                )}
                
                {Array.isArray(domain.departments) && domain.departments.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-slate-500 block mb-1">الإدارات المستهدفة:</span>
                    <div className="flex flex-wrap gap-1">
                      {domain.departments.map((dept) => (
                        <span
                          key={dept.id}
                          className="inline-flex items-center px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded-full"
                        >
                          {dept.name_ar}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
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
                <label className="label">الاسم بالإنجليزية *</label>
                <input
                  type="text"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="input"
                  required
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
              
              {/* Domain skills (optional, especially when creating a new domain) */}
              <div>
                <label className="label">المهارات التابعة لهذا المجال</label>
                <p className="text-xs text-slate-500 mb-2">
                  أضف قائمة المهارات الرئيسية التي تنتمي لهذا المجال. سيحاول النظام ربط المهارات المستخرجة من السير الذاتية بهذه القائمة تلقائيًا.
                </p>

                {form.skills && form.skills.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {form.skills.map((skill, index) => (
                      <div key={skill.id || index} className="flex gap-2">
                        <input
                          type="text"
                          className="input flex-1"
                          placeholder="اسم المهارة بالعربية"
                          value={skill.name_ar}
                          onChange={(e) => {
                            const skills = [...form.skills];
                            skills[index] = { ...skills[index], name_ar: e.target.value };
                            setForm({ ...form, skills });
                          }}
                        />
                        <input
                          type="text"
                          className="input flex-1"
                          placeholder="اسم المهارة بالإنجليزية"
                          dir="ltr"
                          value={skill.name_en}
                          onChange={(e) => {
                            const skills = [...form.skills];
                            skills[index] = { ...skills[index], name_en: e.target.value };
                            setForm({ ...form, skills });
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary px-3"
                          onClick={() => {
                            const skills = form.skills.filter((_, i) => i !== index);
                            setForm({ ...form, skills });
                          }}
                        >
                          حذف
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setForm({
                        ...form,
                        skills: [
                          ...(form.skills || []),
                          { name_ar: '', name_en: '' },
                        ],
                      })
                    }
                  >
                    إضافة مهارة
                  </button>
                </div>
              </div>

              {/* Department selection */}
              <div>
                <label className="label">الإدارات المستهدفة</label>
                <p className="text-xs text-slate-500 mb-2">
                  اختر الإدارات المستهدفة لهذا المجال
                </p>
                
                <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto bg-slate-50">
                  {departments.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-2">لا توجد إدارات متاحة</p>
                  ) : (
                    <div className="space-y-2">
                      {departments.map((dept) => (
                        <label
                          key={dept.id}
                          className="flex items-center gap-2 p-2 hover:bg-white rounded cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={form.department_ids.includes(dept.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({
                                  ...form,
                                  department_ids: [...form.department_ids, dept.id],
                                });
                              } else {
                                setForm({
                                  ...form,
                                  department_ids: form.department_ids.filter((id) => id !== dept.id),
                                });
                              }
                            }}
                            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-slate-700">{dept.name_ar}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                
                {form.department_ids.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.department_ids.map((deptId) => {
                      const dept = departments.find((d) => d.id === deptId);
                      return dept ? (
                        <span
                          key={deptId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full"
                        >
                          {dept.name_ar}
                          <button
                            type="button"
                            onClick={() => {
                              setForm({
                                ...form,
                                department_ids: form.department_ids.filter((id) => id !== deptId),
                              });
                            }}
                            className="hover:text-primary-900"
                          >
                            ×
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
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

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDomainToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد حذف المجال"
        message={domainToDelete ? `هل أنت متأكد من حذف مجال "${domainToDelete.name_ar}"؟\n\nلا يمكن التراجع عن هذا الإجراء.` : ''}
      />

      {/* Bulk CSV Upload Modal */}
      <Dialog open={showBulkUploadModal} onClose={() => !uploadProgress && setShowBulkUploadModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="p-6 border-b border-slate-100">
              <Dialog.Title className="text-xl font-bold text-primary-700">
                رفع ملف CSV للمجالات والمهارات
              </Dialog.Title>
            </div>

            <div className="p-6 space-y-6">
              {!uploadProgress ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      اختر ملف CSV
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleBulkFileChange}
                      className="input w-full"
                    />
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="font-medium text-slate-800 mb-2">صيغة الملف المطلوبة:</h4>
                    <code className="text-xs bg-white p-2 rounded block overflow-x-auto">
                      domain_ar,domain_en,description,skill_ar,skill_en,color_code
                    </code>
                    <div className="mt-3 text-xs text-slate-600 space-y-2">
                      <p className="font-semibold">شرح الأعمدة:</p>
                      <ul className="list-disc list-inside space-y-1 mr-4">
                        <li><strong>domain_ar:</strong> اسم المجال بالعربية (مثال: إدارة المشاريع)</li>
                        <li><strong>domain_en:</strong> اسم المجال بالإنجليزية (مثال: Project Management)</li>
                        <li><strong>description:</strong> وصف المجال (اختياري)</li>
                        <li><strong>skill_ar:</strong> اسم المهارة بالعربية (مثال: تخطيط المشاريع)</li>
                        <li><strong>skill_en:</strong> اسم المهارة بالإنجليزية (مثال: Project Planning)</li>
                        <li><strong>color_code:</strong> رمز لون المجال (مثال: #502390) - اختياري</li>
                      </ul>
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                        <p className="font-semibold text-blue-800 mb-1">💡 ملاحظة مهمة:</p>
                        <ul className="list-disc list-inside space-y-1 text-blue-700">
                          <li>يمكنك إضافة عدة مهارات لنفس المجال بتكرار اسم المجال في أكثر من صف</li>
                          <li>إذا كان المجال موجوداً مسبقاً، سيتم تحديثه وإضافة المهارات الجديدة فقط</li>
                          <li>المهارات المكررة لن تُضاف مرتين</li>
                        </ul>
                      </div>
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                        <p className="font-semibold text-green-800 mb-1">📝 مثال على البيانات:</p>
                        <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
{`domain_ar,domain_en,description,skill_ar,skill_en,color_code
إدارة المشاريع,Project Management,إدارة المشاريع التقنية,تخطيط المشاريع,Project Planning,#502390
إدارة المشاريع,Project Management,إدارة المشاريع التقنية,إدارة المخاطر,Risk Management,#502390
البرمجة,Programming,تطوير البرمجيات,JavaScript,JavaScript,#3B82F6
البرمجة,Programming,تطوير البرمجيات,Python,Python,#3B82F6`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowBulkUploadModal(false)}
                      className="btn btn-secondary"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkUploadCSV}
                      disabled={!uploadFile}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      <ArrowUpTrayIcon className="w-5 h-5" />
                      رفع الملف
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  {uploadProgress.status === 'uploading' && (
                    <div className="space-y-4">
                      <ArrowUpTrayIcon className="w-16 h-16 text-primary-600 mx-auto mb-4 animate-bounce" />
                      <p className="text-lg font-medium text-slate-800">{uploadProgress.message}</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full max-w-md mx-auto">
                        <div className="flex justify-between text-sm text-slate-600 mb-2">
                          <span className="font-semibold">{uploadProgress.percent}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="bg-gradient-to-r from-primary-500 to-primary-600 h-full rounded-full shadow-sm"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress.percent}%` }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {uploadProgress.status === 'completed' && (
                    <div>
                      <CheckCircleIcon className="w-16 h-16 text-green-600 mx-auto mb-4" />
                      <p className="text-lg font-medium text-slate-800 mb-4">{uploadProgress.message}</p>
                      
                      {/* Progress Bar at 100% */}
                      <div className="w-full max-w-md mx-auto mb-4">
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full w-full" />
                        </div>
                      </div>
                      
                      {uploadProgress.details && (
                        <div className="bg-slate-50 rounded-lg p-4 text-right max-w-md mx-auto">
                          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div className="bg-green-100 text-green-700 px-3 py-2 rounded">
                              <div className="font-bold text-2xl">{uploadProgress.details.success}</div>
                              <div className="text-xs">✅ نجح</div>
                            </div>
                            <div className="bg-red-100 text-red-700 px-3 py-2 rounded">
                              <div className="font-bold text-2xl">{uploadProgress.details.failed}</div>
                              <div className="text-xs">❌ فشل</div>
                            </div>
                          </div>
                          {(uploadProgress.details.inserted > 0 || uploadProgress.details.updated > 0 || uploadProgress.details.skillsAdded > 0) && (
                            <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                              <div className="bg-blue-100 text-blue-700 px-3 py-2 rounded">
                                <div className="font-bold text-xl">{uploadProgress.details.inserted || 0}</div>
                                <div className="text-xs">➕ مجال جديد</div>
                              </div>
                              <div className="bg-amber-100 text-amber-700 px-3 py-2 rounded">
                                <div className="font-bold text-xl">{uploadProgress.details.updated || 0}</div>
                                <div className="text-xs">🔄 محدّث</div>
                              </div>
                              <div className="bg-purple-100 text-purple-700 px-3 py-2 rounded">
                                <div className="font-bold text-xl">{uploadProgress.details.skillsAdded || 0}</div>
                                <div className="text-xs">🎯 مهارة</div>
                              </div>
                            </div>
                          )}
                          <div className="pt-3 border-t border-slate-200">
                            <p className="text-sm text-slate-600">
                              📊 المجموع: {uploadProgress.details.total}
                              {uploadProgress.totalTime && (
                                <>
                                  <br />
                                  ⏱️ الوقت المستغرق: {uploadProgress.totalTime} ثانية
                                </>
                              )}
                            </p>
                          </div>
                          {uploadProgress.details.errors && uploadProgress.details.errors.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <p className="text-sm font-semibold text-red-700 mb-2">⚠️ أخطاء:</p>
                              <div className="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
                                {uploadProgress.details.errors.map((err, idx) => (
                                  <div key={idx} className="bg-red-50 p-2 rounded">
                                    <strong>{err.domain}:</strong> {err.error}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {uploadProgress.status === 'error' && (
                    <div>
                      <XCircleIcon className="w-16 h-16 text-red-600 mx-auto mb-4" />
                      <p className="text-lg font-medium text-slate-800 mb-2">{uploadProgress.message}</p>
                      <p className="text-sm text-slate-500 mb-4">يرجى المحاولة مرة أخرى</p>
                      <button
                        onClick={() => {
                          setUploadProgress(null);
                          setUploadFile(null);
                        }}
                        className="btn btn-primary mt-4"
                      >
                        إعادة المحاولة
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}

