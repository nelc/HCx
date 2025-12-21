import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { Menu, Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatDate, getStatusColor, getStatusLabel } from '../utils/helpers';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [testToDelete, setTestToDelete] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [testToAssign, setTestToAssign] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchTests();
    fetchDomains();
  }, [selectedDomain, selectedStatus]);

  const fetchTests = async () => {
    try {
      let url = '/tests?';
      if (selectedDomain) url += `domain_id=${selectedDomain}&`;
      if (selectedStatus) url += `status=${selectedStatus}`;
      
      const response = await api.get(url);
      setTests(response.data.tests || []);
    } catch (error) {
      toast.error('فشل في تحميل التقييمات');
    } finally {
      setLoading(false);
    }
  };

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains');
      setDomains(response.data || []);
    } catch (error) {
      console.error('Failed to fetch domains');
    }
  };

  const handlePublish = async (testId) => {
    try {
      await api.post(`/tests/${testId}/publish`);
      toast.success('تم نشر التقييم بنجاح');
      fetchTests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في نشر التقييم');
    }
  };

  const handleDuplicate = async (testId) => {
    try {
      await api.post(`/tests/${testId}/duplicate`);
      toast.success('تم نسخ التقييم بنجاح');
      fetchTests();
    } catch (error) {
      toast.error('فشل في نسخ التقييم');
    }
  };

  const handleDelete = (testId) => {
    const test = tests.find(t => t.id === testId);
    setTestToDelete(test);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!testToDelete) return;
    
    try {
      await api.delete(`/tests/${testToDelete.id}`);
      toast.success('تم حذف التقييم بنجاح');
      fetchTests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حذف التقييم');
    } finally {
      setShowDeleteModal(false);
      setTestToDelete(null);
    }
  };

  const openAssignModal = async (test) => {
    setTestToAssign(test);
    setShowAssignModal(true);
    
    try {
      const [empRes, deptRes] = await Promise.all([
        api.get('/users/list/employees'),
        api.get('/departments')
      ]);
      setEmployees(empRes.data || []);
      setDepartments(deptRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data');
    }
  };

  const handleAssign = async () => {
    if (selectedEmployees.length === 0 && !selectedDepartment) {
      toast.error('الرجاء اختيار موظفين أو قسم');
      return;
    }
    
    setAssigning(true);
    
    try {
      if (selectedDepartment) {
        await api.post('/assignments/department', {
          test_id: testToAssign.id,
          department_id: selectedDepartment,
        });
      } else {
        await api.post('/assignments', {
          test_id: testToAssign.id,
          user_ids: selectedEmployees,
        });
      }
      
      toast.success('تم تعيين التقييم بنجاح');
      setShowAssignModal(false);
      setTestToAssign(null);
      setSelectedEmployees([]);
      setSelectedDepartment('');
      fetchTests();
    } catch (error) {
      toast.error('فشل في تعيين التقييم');
    } finally {
      setAssigning(false);
    }
  };

  const filteredTests = tests.filter(test =>
    test.title_ar?.toLowerCase().includes(search.toLowerCase()) ||
    test.title_en?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">التقييمات</h1>
          <p className="text-slate-500">إدارة الاستبيانات والاختبارات</p>
        </div>
        <Link to="/tests/new" className="btn btn-primary">
          <PlusIcon className="w-5 h-5" />
          إنشاء تقييم جديد
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="البحث عن تقييم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pr-10"
            />
          </div>
          
          {/* Domain filter */}
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="input w-full sm:w-48"
          >
            <option value="">جميع المجالات</option>
            {domains.map(domain => (
              <option key={domain.id} value={domain.id}>{domain.name_ar}</option>
            ))}
          </select>
          
          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input w-full sm:w-40"
          >
            <option value="">جميع الحالات</option>
            <option value="draft">مسودة</option>
            <option value="published">منشور</option>
            <option value="closed">مغلق</option>
          </select>
        </div>
      </div>

      {/* Tests grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2 mb-6"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-slate-200 rounded w-16"></div>
                <div className="h-6 bg-slate-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FunnelIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد تقييمات</h3>
          <p className="text-slate-500 mb-4">لم يتم العثور على أي تقييمات مطابقة</p>
          <Link to="/tests/new" className="btn btn-primary inline-flex">
            <PlusIcon className="w-5 h-5" />
            إنشاء أول تقييم
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTests.map((test, index) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card group"
              style={{ overflow: 'visible' }}
            >
              {/* Domain color bar */}
              <div 
                className="h-1 rounded-t-xl overflow-hidden"
                style={{ backgroundColor: test.domain_color || '#502390' }}
              ></div>
              
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate group-hover:text-primary-700 transition-colors">
                      {test.title_ar}
                    </h3>
                    <p className="text-sm text-slate-500">{test.domain_name_ar}</p>
                  </div>
                  
                  {/* Actions menu */}
                  <Menu as="div" className="relative">
                    <Menu.Button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                      <EllipsisVerticalIcon className="w-5 h-5" />
                    </Menu.Button>
                    <Menu.Items className="absolute left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to={`/tests/${test.id}`}
                            className={`flex items-center gap-2 px-4 py-2 text-sm ${active ? 'bg-slate-50' : ''}`}
                          >
                            <EyeIcon className="w-4 h-4 text-slate-400" />
                            عرض التفاصيل
                          </Link>
                        )}
                      </Menu.Item>
                      {test.status === 'draft' && (
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              to={`/tests/${test.id}/edit`}
                              className={`flex items-center gap-2 px-4 py-2 text-sm ${active ? 'bg-slate-50' : ''}`}
                            >
                              <PencilIcon className="w-4 h-4 text-slate-400" />
                              تعديل
                            </Link>
                          )}
                        </Menu.Item>
                      )}
                      {test.status === 'published' && (
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={() => openAssignModal(test)}
                              className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${active ? 'bg-slate-50' : ''}`}
                            >
                              <UserGroupIcon className="w-4 h-4 text-slate-400" />
                              تعيين موظفين
                            </button>
                          )}
                        </Menu.Item>
                      )}
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => handleDuplicate(test.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full ${active ? 'bg-slate-50' : ''}`}
                          >
                            <DocumentDuplicateIcon className="w-4 h-4 text-slate-400" />
                            نسخ التقييم
                          </button>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => handleDelete(test.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full text-red-600 ${active ? 'bg-red-50' : ''}`}
                          >
                            <TrashIcon className="w-4 h-4" />
                            حذف
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Menu>
                </div>
                
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                  <span>{test.questions_count || 0} سؤال</span>
                  <span>•</span>
                  <span>{test.duration_minutes || '-'} دقيقة</span>
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <span className={`badge ${getStatusColor(test.status)}`}>
                    {getStatusLabel(test.status)}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {test.status === 'draft' && (
                      <button
                        onClick={() => handlePublish(test.id)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        نشر
                      </button>
                    )}
                    {test.status === 'published' && (
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <UserGroupIcon className="w-4 h-4" />
                        {test.completed_count || 0}/{test.assignments_count || 0}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setTestToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد حذف التقييم"
        message={testToDelete ? `هل أنت متأكد من حذف "${testToDelete.title_ar}"؟` : ''}
      />

      {/* Assign Modal */}
      <Dialog open={showAssignModal} onClose={() => setShowAssignModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              تعيين التقييم للموظفين
            </Dialog.Title>
            
            {testToAssign && (
              <p className="text-sm text-slate-600 mb-6">
                تقييم: <span className="font-medium">{testToAssign.title_ar}</span>
              </p>
            )}
            
            {/* Assign to department */}
            <div className="mb-6">
              <label className="label">تعيين لقسم كامل</label>
              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  if (e.target.value) setSelectedEmployees([]);
                }}
                className="input"
              >
                <option value="">اختر قسم</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name_ar}</option>
                ))}
              </select>
            </div>
            
            {!selectedDepartment && (
              <>
                <div className="text-center text-slate-500 my-4">- أو -</div>
                
                {/* Select employees */}
                <div>
                  <label className="label">اختيار موظفين محددين</label>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    {employees.map(emp => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(emp.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmployees([...selectedEmployees, emp.id]);
                            } else {
                              setSelectedEmployees(selectedEmployees.filter(id => id !== emp.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600"
                        />
                        <div>
                          <p className="font-medium text-slate-700">{emp.name_ar}</p>
                          <p className="text-xs text-slate-500">{emp.department_name_ar}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedEmployees.length > 0 && (
                    <p className="text-sm text-slate-500 mt-2">
                      تم اختيار {selectedEmployees.length} موظف
                    </p>
                  )}
                </div>
              </>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setTestToAssign(null);
                  setSelectedEmployees([]);
                  setSelectedDepartment('');
                }}
                className="btn btn-secondary flex-1"
              >
                إلغاء
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || (selectedEmployees.length === 0 && !selectedDepartment)}
                className="btn btn-primary flex-1"
              >
                {assigning ? 'جاري التعيين...' : 'تعيين'}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}

