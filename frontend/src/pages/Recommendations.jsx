import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AcademicCapIcon,
  CheckCircleIcon,
  PlayIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { getStatusColor, getStatusLabel } from '../utils/helpers';

export default function Recommendations() {
  const { user } = useAuthStore();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const isEmployee = user?.role === 'employee';

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const url = isEmployee ? '/recommendations/my' : '/recommendations';
      const response = await api.get(url);
      setRecommendations(isEmployee ? response.data : response.data.recommendations || []);
    } catch (error) {
      toast.error('فشل في تحميل التوصيات');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/recommendations/${id}/status`, { status });
      toast.success('تم تحديث الحالة');
      fetchRecommendations();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
    }
  };

  const filteredRecommendations = recommendations.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'recommended';
    if (filter === 'in_progress') return r.status === 'in_progress' || r.status === 'enrolled';
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  const pendingCount = recommendations.filter(r => r.status === 'recommended').length;
  const inProgressCount = recommendations.filter(r => r.status === 'in_progress' || r.status === 'enrolled').length;
  const completedCount = recommendations.filter(r => r.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">
          {isEmployee ? 'التوصيات التدريبية' : 'إدارة التوصيات'}
        </h1>
        <p className="text-slate-500">
          {isEmployee ? 'الدورات والبرامج التدريبية الموصى بها لك' : 'عرض وإدارة التوصيات التدريبية للموظفين'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'all' 
              ? 'bg-primary-700 text-white' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          الكل ({recommendations.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'pending' 
              ? 'bg-primary-700 text-white' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          موصى بها ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'in_progress' 
              ? 'bg-primary-700 text-white' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          قيد التنفيذ ({inProgressCount})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'completed' 
              ? 'bg-primary-700 text-white' 
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          مكتملة ({completedCount})
        </button>
      </div>

      {/* Recommendations list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-slate-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredRecommendations.length === 0 ? (
        <div className="card p-12 text-center">
          <AcademicCapIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد توصيات</h3>
          <p className="text-slate-500">
            {filter === 'all' 
              ? 'لم يتم إنشاء أي توصيات تدريبية بعد'
              : 'لا توجد توصيات في هذه الفئة'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecommendations.map((rec, index) => (
            <motion.div
              key={rec.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card overflow-hidden"
            >
              <div 
                className="h-1"
                style={{ backgroundColor: rec.domain_color || '#0e395e' }}
              ></div>
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Icon */}
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (rec.domain_color || '#0e395e') + '20' }}
                  >
                    <BookOpenIcon 
                      className="w-7 h-7"
                      style={{ color: rec.domain_color || '#0e395e' }}
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-semibold text-lg text-slate-800">{rec.course_title_ar}</h3>
                      <span className={`badge ${getStatusColor(rec.status)} shrink-0`}>
                        {getStatusLabel(rec.status)}
                      </span>
                    </div>
                    
                    {rec.course_description_ar && (
                      <p className="text-slate-600 mb-3">{rec.course_description_ar}</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {rec.skill_name_ar && (
                        <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full">
                          {rec.skill_name_ar}
                        </span>
                      )}
                      {rec.domain_name_ar && (
                        <span className="text-slate-500">{rec.domain_name_ar}</span>
                      )}
                      {!isEmployee && rec.user_name_ar && (
                        <span className="text-slate-500">• {rec.user_name_ar}</span>
                      )}
                      {rec.duration_hours && (
                        <span className="text-slate-500">• {rec.duration_hours} ساعة</span>
                      )}
                      {rec.provider && (
                        <span className="text-slate-500">• {rec.provider}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  {isEmployee && (
                    <div className="flex gap-2 shrink-0">
                      {rec.status === 'recommended' && (
                        <>
                          <button
                            onClick={() => updateStatus(rec.id, 'in_progress')}
                            className="btn btn-primary"
                          >
                            <PlayIcon className="w-5 h-5" />
                            بدء التدريب
                          </button>
                          <button
                            onClick={() => updateStatus(rec.id, 'skipped')}
                            className="btn btn-secondary"
                          >
                            تخطي
                          </button>
                        </>
                      )}
                      {rec.status === 'in_progress' && (
                        <button
                          onClick={() => updateStatus(rec.id, 'completed')}
                          className="btn btn-primary"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          إكمال
                        </button>
                      )}
                      {rec.course_url && (
                        <a
                          href={rec.course_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                        >
                          <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                          فتح الدورة
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

