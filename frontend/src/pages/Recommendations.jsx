import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AcademicCapIcon,
  CheckCircleIcon,
  PlayIcon,
  BookOpenIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  SparklesIcon,
  ClockIcon,
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
  const [neo4jMeta, setNeo4jMeta] = useState(null);

  const isEmployee = user?.role === 'employee';

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      if (isEmployee) {
        // Fetch Neo4j-powered recommendations
        const response = await api.get(`/recommendations/neo4j/${user.id}`);
        setRecommendations(response.data.recommendations || []);
        setNeo4jMeta({
          total: response.data.total,
          analyzed_at: response.data.analyzed_at,
          source: response.data.source
        });
      } else {
        // Training officers see all recommendations
        const response = await api.get('/recommendations');
        setRecommendations(response.data.recommendations || []);
        setNeo4jMeta(null);
      }
    } catch (error) {
      toast.error('فشل في تحميل التوصيات');
      console.error('Fetch recommendations error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    toast.loading('جاري تحديث التوصيات...');
    await fetchRecommendations();
    toast.dismiss();
    toast.success('تم تحديث التوصيات بنجاح');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-2">
            {isEmployee ? 'التوصيات' : 'إدارة التوصيات'}
          </h1>
          <p className="text-slate-500">
            {isEmployee ? 'الدورات والبرامج التدريبية الموصى بها لك' : 'عرض وإدارة التوصيات التدريبية للموظفين'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {neo4jMeta && isEmployee && (
            <div className="text-sm text-slate-500">
              {neo4jMeta.total} توصية • آخر تحليل: {new Date(neo4jMeta.analyzed_at).toLocaleDateString('ar-SA')}
            </div>
          )}
          {isEmployee && (
            <button
              onClick={handleRefresh}
              className="btn btn-secondary"
              disabled={loading}
            >
              <ArrowPathIcon className="w-5 h-5" />
              تحديث
            </button>
          )}
        </div>
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
          <p className="text-slate-500 mb-4">
            {filter === 'all' 
              ? 'لم يتم العثور على دورات مطابقة. أكمل تقييماً أولاً للحصول على توصيات مخصصة.'
              : 'لا توجد توصيات في هذه الفئة'}
          </p>
          {isEmployee && (
            <button
              onClick={handleRefresh}
              className="btn btn-primary inline-flex"
            >
              <ArrowPathIcon className="w-5 h-5" />
              تحديث التوصيات
            </button>
          )}
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
                style={{ backgroundColor: rec.domain_color || '#502390' }}
              ></div>
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Icon */}
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (rec.domain_color || '#502390') + '20' }}
                  >
                    <BookOpenIcon 
                      className="w-7 h-7"
                      style={{ color: rec.domain_color || '#502390' }}
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-semibold text-lg text-slate-800">
                        {rec.name_ar || rec.course_title_ar}
                      </h3>
                      {rec.status && (
                        <span className={`badge ${getStatusColor(rec.status)} shrink-0`}>
                          {getStatusLabel(rec.status)}
                        </span>
                      )}
                      {rec.recommendation_score && (
                        <span className="badge bg-green-100 text-green-700 shrink-0 flex items-center gap-1">
                          <SparklesIcon className="w-4 h-4" />
                          {Math.round(rec.recommendation_score)}% مطابقة
                        </span>
                      )}
                    </div>
                    
                    {(rec.description_ar || rec.course_description_ar) && (
                      <p className="text-slate-600 mb-3 line-clamp-2">
                        {rec.description_ar || rec.course_description_ar}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {/* Neo4j matching skills */}
                      {rec.matching_skills && rec.matching_skills.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {rec.matching_skills.map((skill, idx) => (
                            <span key={idx} className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-xs">
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Traditional skill */}
                      {!rec.matching_skills && rec.skill_name_ar && (
                        <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full">
                          {rec.skill_name_ar}
                        </span>
                      )}
                      {/* Skills from course object */}
                      {rec.skills && rec.skills.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {rec.skills.map((skill) => skill && (
                            <span key={skill.id} className="bg-primary-50 text-primary-700 px-3 py-1 rounded-full text-xs">
                              {skill.name_ar}
                            </span>
                          ))}
                        </div>
                      )}
                      {rec.domain_name_ar && (
                        <span className="text-slate-500">{rec.domain_name_ar}</span>
                      )}
                      {!isEmployee && rec.user_name_ar && (
                        <span className="text-slate-500">• {rec.user_name_ar}</span>
                      )}
                      {rec.duration_hours && (
                        <div className="flex items-center gap-1 text-slate-500">
                          <ClockIcon className="w-4 h-4" />
                          <span>{rec.duration_hours} ساعة</span>
                        </div>
                      )}
                      {rec.provider && (
                        <span className="text-slate-500">• {rec.provider}</span>
                      )}
                      {rec.university && (
                        <span className="text-slate-500">• {rec.university}</span>
                      )}
                      {rec.subject && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                          {rec.subject}
                        </span>
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
                      {(rec.url || rec.course_url) && (
                        <a
                          href={rec.url || rec.course_url}
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

