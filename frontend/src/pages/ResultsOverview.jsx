import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  EyeIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import { formatDate } from '../utils/helpers';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function ResultsOverview() {
  const [results, setResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [tests, setTests] = useState([]);
  const [filters, setFilters] = useState({
    department_id: '',
    test_id: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [resultToDelete, setResultToDelete] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, results]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch results and filter options in parallel
      const [resultsRes, filtersRes] = await Promise.all([
        api.get('/results-overview'),
        api.get('/results-overview/filters')
      ]);
      
      setResults(resultsRes.data);
      setFilteredResults(resultsRes.data);
      setDepartments(filtersRes.data.departments || []);
      setTests(filtersRes.data.tests || []);
    } catch (error) {
      console.error('Failed to fetch results overview');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...results];

    if (filters.department_id) {
      filtered = filtered.filter(r => r.department_id === filters.department_id);
    }

    if (filters.test_id) {
      filtered = filtered.filter(r => r.test_id === filters.test_id);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(r => 
        r.employee_name?.toLowerCase().includes(searchLower) ||
        r.employee_number?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredResults(filtered);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      department_id: '',
      test_id: '',
      search: ''
    });
  };

  const hasActiveFilters = filters.department_id || filters.test_id || filters.search;

  const getGradeColor = (grade) => {
    if (grade >= 70) return 'text-success-600 bg-success-50';
    if (grade >= 40) return 'text-warning-600 bg-warning-50';
    return 'text-danger-600 bg-danger-50';
  };

  const handleDelete = (result) => {
    setResultToDelete(result);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!resultToDelete) return;

    try {
      await api.delete(`/results-overview/${resultToDelete.assignment_id}`);
      toast.success('تم حذف النتيجة بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'فشل في حذف النتيجة');
    } finally {
      setShowDeleteModal(false);
      setResultToDelete(null);
    }
  };

  const handleDownload = async (type) => {
    setDownloading(true);
    setShowDownloadMenu(false);
    try {
      let url = `/results-overview/export/${type}`;
      
      if (type === 'filtered') {
        const params = new URLSearchParams();
        if (filters.department_id) params.append('department_id', filters.department_id);
        if (filters.test_id) params.append('test_id', filters.test_id);
        if (filters.search) params.append('search', filters.search);
        if (params.toString()) url += `?${params.toString()}`;
      }
      
      const response = await api.get(url, { responseType: 'blob' });
      
      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Generate filename based on type
      const dateStr = new Date().toISOString().split('T')[0];
      const filenames = {
        'users-results': `نتائج-الموظفين-${dateStr}.csv`,
        'tests-summary': `ملخص-التقييمات-${dateStr}.csv`,
        'filtered': `نتائج-مفلترة-${dateStr}.csv`
      };
      link.download = filenames[type] || `تصدير-${dateStr}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('تم تحميل الملف بنجاح');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('فشل في تحميل الملف');
    } finally {
      setDownloading(false);
    }
  };

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDownloadMenu && !event.target.closest('.download-dropdown')) {
        setShowDownloadMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDownloadMenu]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري تحميل النتائج...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">النتائج والتحليلات</h1>
          <p className="text-slate-500 mt-1">عرض نتائج جميع الموظفين في التقييمات</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {filteredResults.length} نتيجة
          </span>
          
          {/* Download Dropdown */}
          <div className="relative download-dropdown">
            <button
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              disabled={downloading}
              className="btn btn-primary flex items-center gap-2"
            >
              {downloading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowDownTrayIcon className="w-5 h-5" />
              )}
              <span>تصدير CSV</span>
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            
            {showDownloadMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50"
              >
                <button
                  onClick={() => handleDownload('users-results')}
                  className="w-full px-4 py-2 text-right text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 text-slate-400" />
                  <span>تصدير نتائج الموظفين</span>
                </button>
                <button
                  onClick={() => handleDownload('tests-summary')}
                  className="w-full px-4 py-2 text-right text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 text-slate-400" />
                  <span>تصدير ملخص التقييمات</span>
                </button>
                <div className="border-t border-slate-200 my-1"></div>
                <button
                  onClick={() => handleDownload('filtered')}
                  className="w-full px-4 py-2 text-right text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 text-slate-400" />
                  <div className="flex flex-col items-start">
                    <span>تصدير النتائج المفلترة</span>
                    {hasActiveFilters && (
                      <span className="text-xs text-primary-600">
                        (مع الفلاتر الحالية)
                      </span>
                    )}
                  </div>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Summary */}
      {filteredResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-sm text-slate-500 mb-1">إجمالي النتائج</p>
            <p className="text-2xl font-bold text-primary-700">
              {filteredResults.length}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-slate-500 mb-1">متوسط الدرجات</p>
            <p className="text-2xl font-bold text-slate-700">
              {(() => {
                const gradesOnly = filteredResults.filter(r => r.grade != null && typeof r.grade === 'number');
                if (gradesOnly.length === 0) return '-';
                const average = gradesOnly.reduce((sum, r) => sum + r.grade, 0) / gradesOnly.length;
                return `${Math.round(average)}%`;
              })()}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-slate-500 mb-1">نتائج ممتازة (70%+)</p>
            <p className="text-2xl font-bold text-success-600">
              {filteredResults.filter(r => r.grade >= 70).length}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-slate-500 mb-1">تحتاج تطوير (&lt;40%)</p>
            <p className="text-2xl font-bold text-danger-600">
              {filteredResults.filter(r => r.grade !== null && r.grade < 40).length}
            </p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="البحث باسم الموظف أو رقم الموظف..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="input pr-10 w-full"
              />
            </div>
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
          >
            <FunnelIcon className="w-5 h-5" />
            <span>الفلاتر</span>
            {hasActiveFilters && (
              <span className="bg-white text-primary-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                {[filters.department_id, filters.test_id].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-slate-200"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Department Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  القسم
                </label>
                <select
                  value={filters.department_id}
                  onChange={(e) => handleFilterChange('department_id', e.target.value)}
                  className="input w-full"
                >
                  <option value="">جميع الأقسام</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              {/* Test Filter */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  التقييم
                </label>
                <select
                  value={filters.test_id}
                  onChange={(e) => handleFilterChange('test_id', e.target.value)}
                  className="input w-full"
                >
                  <option value="">جميع التقييمات</option>
                  {tests.map(test => (
                    <option key={test.id} value={test.id}>
                      {test.title_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="btn btn-secondary text-sm flex items-center gap-2"
                >
                  <XMarkIcon className="w-4 h-4" />
                  <span>مسح الفلاتر</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Results Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">اسم الموظف</th>
                <th className="text-right">القسم</th>
                <th className="text-right">اسم التقييم</th>
                <th className="text-center">الدرجة</th>
                <th className="text-right">تاريخ الإكمال</th>
                <th className="text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12">
                    <ChartBarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">
                      {hasActiveFilters 
                        ? 'لا توجد نتائج تطابق معايير البحث'
                        : 'لا توجد نتائج متاحة حالياً'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredResults.map((result) => (
                  <motion.tr
                    key={result.assignment_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td>
                      <div>
                        <p className="font-medium text-slate-800">
                          {result.employee_name || 'غير محدد'}
                        </p>
                        {result.employee_number && (
                          <p className="text-xs text-slate-500">
                            {result.employee_number}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-slate-700">
                        {result.department_name || 'غير محدد'}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-700">
                          {result.test_name}
                        </span>
                        {/* Needs Grading Tag - when there are ungraded open questions */}
                        {result.needs_grading && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium w-fit">
                            <ExclamationTriangleIcon className="w-3 h-3" />
                            يحتاج تقييم ({result.ungraded_count} سؤال)
                          </span>
                        )}
                        {/* Graded Tag - when all open questions have been graded */}
                        {!result.needs_grading && result.total_open_questions > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium w-fit">
                            <CheckCircleIcon className="w-3 h-3" />
                            تم التقييم
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      {result.grade !== null ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-semibold text-sm ${getGradeColor(result.grade)}`}>
                            {result.grade}%
                          </span>
                          {result.needs_grading && (
                            <span className="text-xs text-amber-600">
                              (غير نهائية)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">
                          قيد التحليل
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="text-slate-600 text-sm">
                        {formatDate(result.completed_at)}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {result.analysis_id ? (
                          <Link
                            to={`/results/${result.analysis_id}?assignment_id=${result.assignment_id}`}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                              result.needs_grading 
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' 
                                : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                            }`}
                          >
                            <EyeIcon className="w-4 h-4" />
                            <span>{result.needs_grading ? 'تقييم الأسئلة' : 'عرض النتائج'}</span>
                          </Link>
                        ) : (
                          <span className="text-slate-400 text-sm">
                            لا يوجد تحليل
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(result)}
                          className="p-1.5 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                          title="حذف النتيجة"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setResultToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد حذف النتيجة"
        message={resultToDelete ? `هل أنت متأكد من حذف نتيجة "${resultToDelete.employee_name || 'غير محدد'}"؟\nسيتم حذف جميع الإجابات والتحليلات المرتبطة.` : ''}
      />
    </div>
  );
}
