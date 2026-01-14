import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ClipboardDocumentListIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import { formatDate, getTimeRemaining, getStatusColor, getStatusLabel } from '../utils/helpers';

export default function MyAssessments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await api.get('/assignments/my');
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Failed to fetch assignments');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssignments = assignments.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'pending') return a.status === 'pending' || a.status === 'in_progress';
    if (filter === 'completed') return a.status === 'completed';
    return true;
  });

  const pendingCount = assignments.filter(a => a.status === 'pending' || a.status === 'in_progress').length;
  const completedCount = assignments.filter(a => a.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">تقييماتي</h1>
        <p className="text-slate-500">قائمة التقييمات المعينة لك</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => setFilter('all')}
          className={`card p-4 text-right transition-all ${filter === 'all' ? 'ring-2 ring-primary-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-50 rounded-xl">
              <ClipboardDocumentListIcon className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary-700">{assignments.length}</p>
              <p className="text-sm text-slate-500">إجمالي التقييمات</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFilter('pending')}
          className={`card p-4 text-right transition-all ${filter === 'pending' ? 'ring-2 ring-warning-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-warning-50 rounded-xl">
              <ClockIcon className="w-6 h-6 text-warning-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning-600">{pendingCount}</p>
              <p className="text-sm text-slate-500">قيد الانتظار</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFilter('completed')}
          className={`card p-4 text-right transition-all ${filter === 'completed' ? 'ring-2 ring-success-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-success-50 rounded-xl">
              <CheckCircleIcon className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success-600">{completedCount}</p>
              <p className="text-sm text-slate-500">مكتمل</p>
            </div>
          </div>
        </button>
      </div>

      {/* Assignments list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-32"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ClipboardDocumentListIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد تقييمات</h3>
          <p className="text-slate-500">
            {filter === 'pending' ? 'لا توجد تقييمات معلقة' : 
             filter === 'completed' ? 'لم تكمل أي تقييمات بعد' : 
             'لم يتم تعيين أي تقييمات لك'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map((assignment, index) => {
            const timeRemaining = getTimeRemaining(assignment.due_date);
            const isUrgent = timeRemaining && !timeRemaining.expired && timeRemaining.text.includes('ساعة');
            
            return (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`card overflow-hidden ${isUrgent ? 'ring-2 ring-warning-500/50' : ''}`}
              >
                <div 
                  className="h-1"
                  style={{ backgroundColor: assignment.domain_color || '#502390' }}
                ></div>
                
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Icon */}
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (assignment.domain_color || '#502390') + '20' }}
                    >
                      <ClipboardDocumentListIcon 
                        className="w-7 h-7" 
                        style={{ color: assignment.domain_color || '#502390' }}
                      />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-slate-800 text-lg">{assignment.test_title_ar}</h3>
                          <p className="text-slate-500">{assignment.domain_name_ar}</p>
                        </div>
                        <span className={`badge ${getStatusColor(assignment.status)}`}>
                          {getStatusLabel(assignment.status)}
                        </span>
                      </div>
                      
                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <ClipboardDocumentListIcon className="w-4 h-4" />
                          {assignment.questions_count} سؤال
                        </span>
                        {assignment.duration_minutes && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-4 h-4" />
                            {assignment.duration_minutes} دقيقة
                          </span>
                        )}
                        {timeRemaining && assignment.status !== 'completed' && (
                          <span className={`flex items-center gap-1 ${timeRemaining.expired ? 'text-danger-500' : isUrgent ? 'text-warning-600' : ''}`}>
                            <ExclamationCircleIcon className="w-4 h-4" />
                            {timeRemaining.expired ? 'منتهي' : `متبقي ${timeRemaining.text}`}
                          </span>
                        )}
                      </div>
                      
                      {/* Target Skills */}
                      {assignment.target_skills && assignment.target_skills.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-2">
                            <span className="font-semibold">المهارات المستهدفة:</span> Targeted Skills
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {assignment.target_skills.map((skill) => (
                              <span 
                                key={skill.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-50 text-primary-700"
                              >
                                {skill.name_ar}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="sm:mr-4">
                      {assignment.status === 'completed' ? (
                        <Link
                          to={`/results/${assignment.id}`}
                          className="btn btn-secondary"
                        >
                          عرض النتائج
                        </Link>
                      ) : (
                        <Link
                          to={`/assessments/${assignment.id}/take`}
                          className="btn btn-primary"
                        >
                          <PlayIcon className="w-5 h-5" />
                          {assignment.status === 'in_progress' ? 'متابعة' : 'ابدأ التقييم'}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

