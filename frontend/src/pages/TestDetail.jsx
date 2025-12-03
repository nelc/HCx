import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRightIcon,
  PencilIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentDuplicateIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatDate, getStatusColor, getStatusLabel } from '../utils/helpers';

export default function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [test, setTest] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchTest();
    fetchAssignments();
  }, [id]);

  const fetchTest = async () => {
    try {
      const response = await api.get(`/tests/${id}`);
      setTest(response.data);
    } catch (error) {
      toast.error('فشل في تحميل التقييم');
      navigate('/tests');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    try {
      const response = await api.get(`/assignments?test_id=${id}`);
      setAssignments(response.data.assignments || []);
    } catch (error) {
      console.error('Failed to fetch assignments');
    }
  };

  const fetchEmployeesAndDepartments = async () => {
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

  const openAssignModal = () => {
    fetchEmployeesAndDepartments();
    setShowAssignModal(true);
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
          test_id: id,
          department_id: selectedDepartment,
        });
      } else {
        await api.post('/assignments', {
          test_id: id,
          user_ids: selectedEmployees,
        });
      }
      
      toast.success('تم تعيين التقييم بنجاح');
      setShowAssignModal(false);
      setSelectedEmployees([]);
      setSelectedDepartment('');
      fetchAssignments();
    } catch (error) {
      toast.error('فشل في تعيين التقييم');
    } finally {
      setAssigning(false);
    }
  };

  const handleAnalyze = async (assignmentId) => {
    try {
      toast.loading('جاري تحليل النتائج...', { id: 'analyzing' });
      await api.post(`/analysis/assignment/${assignmentId}`);
      toast.success('تم التحليل بنجاح', { id: 'analyzing' });
      fetchAssignments();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في التحليل', { id: 'analyzing' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const completedCount = assignments.filter(a => a.status === 'completed').length;
  const pendingAnalysis = assignments.filter(a => a.status === 'completed').length; // Simplified

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <Link to="/tests" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowRightIcon className="w-5 h-5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-primary-700">{test?.title_ar}</h1>
          <p className="text-slate-500">{test?.domain_name_ar}</p>
        </div>
        <div className="flex items-center gap-2">
          {test?.status === 'draft' && (
            <Link to={`/tests/${id}/edit`} className="btn btn-secondary">
              <PencilIcon className="w-5 h-5" />
              تعديل
            </Link>
          )}
          {test?.status === 'published' && (
            <button onClick={openAssignModal} className="btn btn-primary">
              <UserGroupIcon className="w-5 h-5" />
              تعيين للموظفين
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-slate-500">الحالة</p>
          <span className={`badge ${getStatusColor(test?.status)} mt-1`}>
            {getStatusLabel(test?.status)}
          </span>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">عدد الأسئلة</p>
          <p className="text-2xl font-bold text-primary-700">{test?.questions?.length || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">المدة</p>
          <p className="text-2xl font-bold text-primary-700">{test?.duration_minutes || 30} دقيقة</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">نسبة الإكمال</p>
          <p className="text-2xl font-bold text-primary-700">
            {assignments.length > 0 ? Math.round((completedCount / assignments.length) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Test details */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-primary-700 mb-4">تفاصيل التقييم</h2>
        
        {test?.description_ar && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-1">الوصف</p>
            <p className="text-slate-700">{test.description_ar}</p>
          </div>
        )}
        
        {test?.instructions_ar && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-1">التعليمات</p>
            <p className="text-slate-700">{test.instructions_ar}</p>
          </div>
        )}
        
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1 text-slate-600">
            <ClockIcon className="w-4 h-4" />
            {test?.is_timed ? 'مؤقت' : 'غير مؤقت'}
          </span>
          <span className="text-slate-600">
            السرية: {test?.confidentiality_level === 'standard' ? 'عادي' : test?.confidentiality_level}
          </span>
        </div>
      </div>

      {/* Questions preview */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-primary-700 mb-4">الأسئلة ({test?.questions?.length || 0})</h2>
        
        <div className="space-y-3">
          {(test?.questions || []).map((question, index) => (
            <div key={question.id} className="p-3 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="bg-primary-100 text-primary-700 text-sm font-medium px-2 py-1 rounded">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-slate-700">{question.question_ar}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                    <span className="bg-slate-200 px-2 py-0.5 rounded">
                      {question.question_type === 'mcq' ? 'اختيار من متعدد' :
                       question.question_type === 'likert_scale' ? 'مقياس ليكرت' :
                       question.question_type === 'self_rating' ? 'تقييم ذاتي' : 'نص مفتوح'}
                    </span>
                    {question.skill_name_ar && (
                      <span className="bg-primary-100 text-primary-600 px-2 py-0.5 rounded">
                        {question.skill_name_ar}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assignments */}
      {test?.status === 'published' && (
        <div className="card overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-primary-700">التعيينات ({assignments.length})</h2>
          </div>
          
          {assignments.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <UserGroupIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>لم يتم تعيين التقييم لأي موظف بعد</p>
              <button onClick={openAssignModal} className="btn btn-primary mt-4">
                تعيين للموظفين
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>القسم</th>
                    <th>الحالة</th>
                    <th>تاريخ التعيين</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td className="font-medium">{assignment.user_name_ar}</td>
                      <td className="text-slate-500">{assignment.department_name_ar || '-'}</td>
                      <td>
                        <span className={`badge ${getStatusColor(assignment.status)}`}>
                          {getStatusLabel(assignment.status)}
                        </span>
                      </td>
                      <td className="text-slate-500">{formatDate(assignment.created_at)}</td>
                      <td>
                        {assignment.status === 'completed' && (
                          <button
                            onClick={() => handleAnalyze(assignment.id)}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                          >
                            تحليل النتائج
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assign Modal */}
      <Dialog open={showAssignModal} onClose={() => setShowAssignModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <Dialog.Title className="text-xl font-semibold text-primary-700 mb-4">
              تعيين التقييم للموظفين
            </Dialog.Title>
            
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
                onClick={() => setShowAssignModal(false)}
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

