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
  InformationCircleIcon,
  DocumentTextIcon,
  HeartIcon,
  RocketLaunchIcon,
  MapIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentArrowUpIcon,
  CloudArrowDownIcon,
  ExclamationTriangleIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import api from '../utils/api';
import useAuthStore from '../store/authStore';
import { getStatusColor, getStatusLabel } from '../utils/helpers';
import { Link } from 'react-router-dom';
import CertificateUploadModal from '../components/CertificateUploadModal';

export default function Recommendations() {
  const { user } = useAuthStore();
  const [sections, setSections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    learning_map: false,
    learning_favorites: false,
    future_path: false,
    admin_added: false,
    futurex_completed: false,
  });
  
  // Certificate upload modal state
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  
  // NELC/FutureX Integration state (now fetched with main recommendations)
  const [nelcStatus, setNelcStatus] = useState(null);
  const [futurexCourses, setFuturexCourses] = useState(null);
  
  // Filter state: 'all' | 'active' | 'completed'
  const [activeFilter, setActiveFilter] = useState('all');
  
  // Track expanded descriptions by course ID
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  const isEmployee = user?.role === 'employee';
  
  // Toggle description expansion
  const toggleDescription = (courseId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  // OPTIMIZED: Single API call fetches everything (sections, NELC status, FutureX courses)
  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      
      if (isEmployee) {
        // Fetch sectioned Neo4j-powered recommendations (includes NELC data)
        const response = await api.get(`/recommendations/neo4j/${user.id}/sections`);
        setSections(response.data.sections || null);
        
        // Extract NELC status and FutureX courses from combined response
        if (response.data.nelc_status) {
          setNelcStatus(response.data.nelc_status);
        }
        if (response.data.futurex_courses) {
          setFuturexCourses(response.data.futurex_courses);
        }
      } else {
        // Training officers see traditional view
        const response = await api.get('/recommendations');
        setSections(null);
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

  const updateStatus = async (rec, status) => {
    try {
      if (rec.source && !rec.recommendation_id) {
        await api.post('/recommendations/track-course', {
          course_id: rec.course_id || rec.id,
          status
        });
      } else {
        const recId = rec.recommendation_id || rec.id;
        await api.patch(`/recommendations/${recId}/status`, { status });
      }
      toast.success('تم تحديث الحالة');
      fetchRecommendations();
    } catch (error) {
      toast.error('فشل في تحديث الحالة');
      console.error('Update status error:', error);
    }
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => {
      const isCurrentlyExpanded = prev[sectionKey];
      // Close all sections, then open the clicked one (if it was closed)
      return {
        learning_map: false,
        learning_favorites: false,
        future_path: false,
        admin_added: false,
        futurex_completed: false,
        [sectionKey]: !isCurrentlyExpanded
      };
    });
  };

  const getSectionIcon = (sectionKey) => {
    switch (sectionKey) {
      case 'learning_map':
        return MapIcon;
      case 'learning_favorites':
        return HeartIcon;
      case 'future_path':
        return RocketLaunchIcon;
      case 'admin_added':
        return SparklesIcon;
      default:
        return BookOpenIcon;
    }
  };

  const getSectionColor = (sectionKey) => {
    // Use consistent light gray colors for all sections - professional and sophisticated
    return { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-600', badge: 'bg-slate-100 text-slate-700' };
  };

  // Handle opening certificate upload modal
  const handleOpenCertificateModal = (rec) => {
    setSelectedCourse({
      courseId: rec.source === 'admin_added' ? null : rec.course_id,
      adminCourseId: rec.source === 'admin_added' ? rec.id : null,
      courseName: rec.name_ar || rec.course_title_ar
    });
    setShowCertificateModal(true);
  };

  // Handle successful certificate upload
  const handleCertificateUploadSuccess = () => {
    fetchRecommendations();
  };

  // Render a single recommendation card
  // sectionKey is used to determine if "مكتمل" button should be shown (only for admin_added)
  const renderRecommendationCard = (rec, index, sectionKey = null) => (
    <motion.div
      key={rec.id || rec.course_id || index}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`card overflow-hidden ${rec.is_completed ? 'ring-2 ring-success-200' : ''}`}
    >
      <div 
        className="h-1"
        style={{ backgroundColor: rec.is_completed ? '#10B981' : (rec.domain_color || '#502390') }}
      ></div>
      <div className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Icon */}
          <div 
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              rec.is_completed ? 'bg-success-100' : ''
            }`}
            style={!rec.is_completed ? { backgroundColor: (rec.domain_color || '#502390') + '20' } : undefined}
          >
            {rec.is_completed ? (
              <CheckCircleSolidIcon className="w-6 h-6 text-success-600" />
            ) : (
              <BookOpenIcon 
                className="w-6 h-6"
                style={{ color: rec.domain_color || '#502390' }}
              />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg text-slate-800">
                  {rec.name_ar || rec.course_title_ar}
                </h3>
                {(rec.first_domain || rec.subject) && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                    {rec.first_domain || rec.subject}
                  </span>
                )}
                {rec.second_domain && (
                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                    {rec.second_domain}
                  </span>
                )}
                {/* Manually added course badge */}
                {(rec.source === 'local' || rec.is_local) && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                    <PlusCircleIcon className="w-3 h-3" />
                    تمت إضافته يدوياً
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {rec.is_completed ? (
                  <span className="badge bg-success-100 text-success-700 flex items-center gap-1">
                    <CheckCircleSolidIcon className="w-4 h-4" />
                    مكتمل
                  </span>
                ) : rec.status && (
                  <span className={`badge ${getStatusColor(rec.status)}`}>
                    {getStatusLabel(rec.status)}
                  </span>
                )}
              </div>
            </div>
            
            {/* AI-generated summary or original description */}
            {(rec.summary_ar || rec.description_ar || rec.course_description_ar) && (
              <div className="mb-3">
                <p className={`text-slate-600 text-sm ${expandedDescriptions[rec.id || rec.course_id] ? '' : 'line-clamp-2'}`}>
                  {rec.summary_ar || rec.description_ar || rec.course_description_ar}
                </p>
                {(rec.summary_ar || rec.description_ar || rec.course_description_ar)?.length > 100 && (
                  <button
                    onClick={() => toggleDescription(rec.id || rec.course_id)}
                    className="text-primary-600 hover:text-primary-700 text-xs font-medium mt-1"
                  >
                    {expandedDescriptions[rec.id || rec.course_id] ? 'عرض أقل' : 'قراءة المزيد'}
                  </button>
                )}
              </div>
            )}

            {/* Learning Outcomes from AI */}
            {rec.learning_outcomes && rec.learning_outcomes.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-500 font-medium mb-1">نتائج التعلم:</p>
                <div className="flex flex-wrap gap-1">
                  {rec.learning_outcomes.slice(0, 3).map((outcome, idx) => (
                    <span key={idx} className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs">
                      {typeof outcome === 'string' ? outcome : outcome.name || outcome.title || outcome.description}
                    </span>
                  ))}
                  {rec.learning_outcomes.length > 3 && (
                    <span className="text-slate-400 text-xs">+{rec.learning_outcomes.length - 3}</span>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {/* Matching skills from Neo4j */}
              {rec.matching_skills && rec.matching_skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-slate-400 ml-1">مهارات:</span>
                  {rec.matching_skills.slice(0, 3).map((skill, idx) => (
                    <span key={idx} className="bg-primary-50 text-primary-700 px-2 py-1 rounded-full text-xs">
                      {skill}
                    </span>
                  ))}
                  {rec.matching_skills.length > 3 && (
                    <span className="text-slate-500 text-xs">+{rec.matching_skills.length - 3}</span>
                  )}
                </div>
              )}
              {/* Skills from PostgreSQL */}
              {rec.skills && rec.skills.length > 0 && !rec.matching_skills?.length && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-slate-400 ml-1">مهارات:</span>
                  {rec.skills.slice(0, 3).map((skill) => skill && (
                    <span key={skill.id} className="bg-primary-50 text-primary-700 px-2 py-1 rounded-full text-xs">
                      {skill.name_ar}
                    </span>
                  ))}
                </div>
              )}
              {/* AI-extracted skills */}
              {rec.extracted_skills && rec.extracted_skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-amber-500 ml-1">AI:</span>
                  {rec.extracted_skills.slice(0, 3).map((skill, idx) => (
                    <span key={idx} className="bg-amber-50 text-amber-700 px-2 py-1 rounded-full text-xs">
                      {typeof skill === 'string' ? skill : skill.name || skill.name_ar}
                    </span>
                  ))}
                  {rec.extracted_skills.length > 3 && (
                    <span className="text-amber-400 text-xs">+{rec.extracted_skills.length - 3}</span>
                  )}
                </div>
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
              {/* Show completion info with source if completed */}
              {rec.is_completed && rec.completion_certificate && (
                <div className="flex items-center gap-2">
                  {/* Completion source badge */}
                  {rec.completion_certificate.completion_source === 'nelc_sync' || rec.completion_certificate.completion_source === 'nelc' ? (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CloudArrowDownIcon className="w-3 h-3" />
                      من NELC
                    </span>
                  ) : (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <DocumentArrowUpIcon className="w-3 h-3" />
                      شهادة مرفوعة
                    </span>
                  )}
                  {/* Completion date */}
                  {rec.completion_certificate.completed_at && (
                    <span className="text-xs text-success-600 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      {new Date(rec.completion_certificate.completed_at).toLocaleDateString('ar-SA')}
                    </span>
                  )}
                  {/* NELC progress if available */}
                  {rec.completion_certificate.nelc_progress_percentage && (
                    <span className="text-xs text-blue-600">
                      ({rec.completion_certificate.nelc_progress_percentage}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Actions */}
          {isEmployee && (
            <div className="flex gap-2 shrink-0">
              {/* Admin-added courses: show complete button only (when not already completed) */}
              {!rec.is_completed && sectionKey === 'admin_added' && (
                <>
                  {(!rec.status || rec.status === 'recommended' || rec.status === 'in_progress') && (
                    <button
                      onClick={() => handleOpenCertificateModal(rec)}
                      className="btn btn-success btn-sm"
                      title="تمييز كمكتمل مع رفع الشهادة"
                    >
                      <DocumentArrowUpIcon className="w-4 h-4" />
                      مكتمل
                    </button>
                  )}
                </>
              )}
              {(rec.url || rec.course_url) && (
                <a
                  href={rec.url || rec.course_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  // Render a section
  const renderSection = (sectionKey, sectionData) => {
    const isExpanded = expandedSections[sectionKey];
    const SectionIcon = getSectionIcon(sectionKey);
    const colors = getSectionColor(sectionKey);
    
    // Filter recommendations based on activeFilter
    const allRecommendations = sectionData.recommendations || [];
    const filteredRecommendations = allRecommendations.filter(rec => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'completed') return rec.is_completed;
      if (activeFilter === 'active') return !rec.is_completed;
      return true;
    });
    
    const hasRecommendations = filteredRecommendations.length > 0;
    const hasAnyRecommendations = allRecommendations.length > 0;
    const filteredCount = filteredRecommendations.length;

    return (
      <motion.div
        key={sectionKey}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card overflow-hidden ${colors.border} border-2`}
      >
        {/* Section Header */}
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`w-full p-5 ${colors.bg} flex items-center justify-between hover:opacity-90 transition-opacity`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${colors.bg} border-2 ${colors.border} flex items-center justify-center`}>
              <SectionIcon className={`w-6 h-6 ${colors.icon}`} />
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-slate-800">{sectionData.title_ar}</h2>
              <p className="text-sm text-slate-600 mt-1">{sectionData.description_ar}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors.badge}`}>
              {activeFilter !== 'all' ? `${filteredCount} / ${sectionData.count}` : sectionData.count} دورة
            </span>
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5 text-slate-500" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-slate-500" />
            )}
          </div>
        </button>

        {/* Section Content */}
        {isExpanded && (
          <div className="p-5 space-y-4">
            {/* Section Context Info */}
            {sectionKey === 'learning_map' && sectionData.user_category && sectionData.exam_context && (
              <div className={`p-4 rounded-xl ${colors.bg} ${colors.border} border`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: sectionData.user_category.key === 'advanced' ? '#10B981' : sectionData.user_category.key === 'intermediate' ? '#F59E0B' : '#EF4444' }}
                    >
                      {sectionData.user_category.score}%
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">مستواك:</span>
                        <span 
                          className="font-bold px-2 py-1 rounded text-sm"
                          style={{ 
                            backgroundColor: sectionData.user_category.key === 'advanced' ? '#D1FAE5' : sectionData.user_category.key === 'intermediate' ? '#FEF3C7' : '#FEE2E2',
                            color: sectionData.user_category.key === 'advanced' ? '#065F46' : sectionData.user_category.key === 'intermediate' ? '#92400E' : '#991B1B'
                          }}
                        >
                          {sectionData.user_category.label_ar}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">{sectionData.user_category.description_ar}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-white px-3 py-2 rounded-lg">
                    <DocumentTextIcon className="w-5 h-5 text-blue-600" />
                    <span>بناءً على اختبار: <strong>{sectionData.exam_context.test_title_ar}</strong></span>
                  </div>
                </div>
              </div>
            )}

            {sectionKey === 'learning_favorites' && sectionData.selected_interests && sectionData.selected_interests.length > 0 && (
              <div className={`p-4 rounded-xl ${colors.bg} ${colors.border} border`}>
                <div className="flex items-start gap-3">
                  <InformationCircleIcon className="w-5 h-5 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-700 mb-2">اهتماماتك المختارة:</p>
                    <div className="flex flex-wrap gap-2">
                      {sectionData.selected_interests.slice(0, 8).map((interest, idx) => {
                        const skillName = interest.split(':').slice(1).join(':') || interest;
                        return (
                          <span key={idx} className="px-2 py-1 bg-slate-200 text-slate-700 rounded-full text-xs">
                            {skillName}
                          </span>
                        );
                      })}
                      {sectionData.selected_interests.length > 8 && (
                        <span className="text-slate-500 text-xs">+{sectionData.selected_interests.length - 8} أخرى</span>
                      )}
                    </div>
                    <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 mt-2">
                      <Cog6ToothIcon className="w-4 h-4" />
                      تعديل الاهتمامات
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {sectionKey === 'future_path' && sectionData.desired_domains && sectionData.desired_domains.length > 0 && (
              <div className={`p-4 rounded-xl ${colors.bg} ${colors.border} border`}>
                <div className="flex items-start gap-3">
                  <InformationCircleIcon className="w-5 h-5 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-700 mb-2">المجالات الوظيفية المستقبلية:</p>
                    <div className="flex flex-wrap gap-2">
                      {sectionData.desired_domains.map((domain, idx) => (
                        <span 
                          key={domain.id || idx} 
                          className="px-3 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700"
                        >
                          {domain.name_ar}
                        </span>
                      ))}
                    </div>
                    <Link to="/settings" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 mt-2">
                      <Cog6ToothIcon className="w-4 h-4" />
                      تعديل التطلعات المهنية
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Recommendations List */}
            {hasRecommendations ? (
              <div className="space-y-3">
                {filteredRecommendations.map((rec, index) => renderRecommendationCard(rec, index, sectionKey))}
              </div>
            ) : hasAnyRecommendations ? (
              // Has recommendations but none match the current filter
              <div className="text-center py-8">
                {activeFilter === 'completed' ? (
                  <>
                    <CheckCircleSolidIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-slate-600 font-medium mb-2">لا توجد دورات مكتملة</h3>
                    <p className="text-slate-500 text-sm">
                      لم تكمل أي دورة في هذا القسم بعد. أكمل دوراتك وارفع الشهادات أو زامن من NELC.
                    </p>
                  </>
                ) : (
                  <>
                    <AcademicCapIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-slate-600 font-medium mb-2">لا توجد دورات نشطة</h3>
                    <p className="text-slate-500 text-sm">
                      جميع الدورات في هذا القسم مكتملة! أحسنت.
                    </p>
                  </>
                )}
              </div>
            ) : (
              // No recommendations at all
              <div className="text-center py-8">
                <AcademicCapIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-slate-600 font-medium mb-2">لا توجد توصيات</h3>
                <p className="text-slate-500 text-sm">
                  {sectionKey === 'learning_map' && 'أكمل اختباراً للحصول على توصيات مخصصة بناءً على نتائجك'}
                  {sectionKey === 'learning_favorites' && (
                    <>
                      أضف اهتماماتك من{' '}
                      <Link to="/settings" className="text-primary-600 hover:underline">الإعدادات</Link>
                      {' '}للحصول على توصيات مخصصة
                    </>
                  )}
                  {sectionKey === 'future_path' && (
                    <>
                      حدد تطلعاتك المهنية من{' '}
                      <Link to="/settings" className="text-primary-600 hover:underline">الإعدادات</Link>
                      {' '}للحصول على توصيات مسارك المستقبلي
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  // Calculate total recommendations
  const getTotalCount = () => {
    if (!sections) return 0;
    return (sections.learning_map?.count || 0) + 
           (sections.learning_favorites?.count || 0) + 
           (sections.future_path?.count || 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700 mb-2">
            {isEmployee ? 'التوصيات التدريبية' : 'إدارة التوصيات'}
          </h1>
          <p className="text-slate-500">
            {isEmployee ? 'الدورات والبرامج التدريبية الموصى بها لك بناءً على احتياجاتك وأهدافك' : 'عرض وإدارة التوصيات التدريبية للموظفين'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isEmployee && sections && (
            <div className="text-sm text-slate-500">
              {getTotalCount()} توصية إجمالية
            </div>
          )}
          {/* Filter Toggle Buttons */}
          {isEmployee && sections && (
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setActiveFilter('active')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeFilter === 'active'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                النشطة
              </button>
              <button
                onClick={() => setActiveFilter('completed')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                  activeFilter === 'completed'
                    ? 'bg-white text-success-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <CheckCircleSolidIcon className="w-4 h-4" />
                المكتملة
              </button>
            </div>
          )}
          {isEmployee && (
            <button
              onClick={handleRefresh}
              className="btn btn-secondary"
              disabled={loading}
            >
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isEmployee && (sections || futurexCourses) ? (
        /* Sectioned Recommendations for Employees */
        <div className="space-y-6">
          {sections.learning_map?.count > 0 && renderSection('learning_map', sections.learning_map)}
          {sections.learning_favorites?.count > 0 && renderSection('learning_favorites', sections.learning_favorites)}
          {sections.future_path?.count > 0 && renderSection('future_path', sections.future_path)}
          {sections.admin_added?.count > 0 && renderSection('admin_added', sections.admin_added)}
          
          {/* FutureX Completed Courses Section */}
          {futurexCourses && futurexCourses.courses?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card overflow-hidden border-2 border-slate-200"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection('futurex_completed')}
                className="w-full p-5 bg-slate-50 flex items-center justify-between hover:opacity-90 transition-opacity"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center justify-center">
                    <AcademicCapIcon className="w-6 h-6 text-slate-600" />
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-slate-800">دوراتك المكتملة في FutureX</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      الدورات التي أكملتها في منصة FutureX
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                      {futurexCourses.completed_in_nelc || 0} مكتملة
                    </span>
                    <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                      {futurexCourses.total || 0} إجمالي
                    </span>
                  </div>
                  {expandedSections.futurex_completed ? (
                    <ChevronUpIcon className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </button>

              {/* Section Content */}
              {expandedSections.futurex_completed && (
                <div className="p-5 space-y-3">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-800">{futurexCourses.total || 0}</div>
                      <div className="text-xs text-slate-500">إجمالي الدورات</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">{futurexCourses.completed_in_nelc || 0}</div>
                      <div className="text-xs text-green-600">مكتملة</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">{futurexCourses.matched || 0}</div>
                      <div className="text-xs text-green-600">وفق نطاق الاحتياج</div>
                    </div>
                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-slate-700">{futurexCourses.unmatched || 0}</div>
                      <div className="text-xs text-slate-500">خارج نطاق الاحتياج</div>
                    </div>
                  </div>

                  {/* Course List */}
                  <div className="space-y-2">
                    {futurexCourses.courses.map((course, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border bg-slate-50 border-slate-200"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-800">
                              {course.nelc_course.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                course.nelc_course.status === 'Completed' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {course.nelc_course.status === 'Completed' ? 'مكتمل' :
                                 course.nelc_course.status === 'In Progress' ? 'قيد التقدم' :
                                 course.nelc_course.status === 'Enrolled' ? 'مسجل' : course.nelc_course.status}
                              </span>
                              {course.has_match ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircleIcon className="w-3 h-3" />
                                  وفق نطاق الاحتياج
                                </span>
                              ) : (
                                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                  خارج نطاق الاحتياج
                                </span>
                              )}
                            </div>
                          </div>
                          {course.nelc_course.url && (
                            <a
                              href={course.nelc_course.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-600 hover:text-slate-800"
                            >
                              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          
        </div>
      ) : (
        /* No data state */
        <div className="card p-12 text-center">
          <AcademicCapIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">لا توجد توصيات</h3>
          <p className="text-slate-500 mb-4">
            لم يتم العثور على توصيات. أكمل اختباراً أو أضف اهتماماتك للحصول على توصيات مخصصة.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/my-assessments" className="btn btn-primary">
              عرض الاختبارات
            </Link>
            <Link to="/settings" className="btn btn-secondary">
              <Cog6ToothIcon className="w-5 h-5" />
              الإعدادات
            </Link>
          </div>
        </div>
      )}

      {/* Certificate Upload Modal */}
      <CertificateUploadModal
        isOpen={showCertificateModal}
        onClose={() => {
          setShowCertificateModal(false);
          setSelectedCourse(null);
        }}
        courseId={selectedCourse?.courseId}
        adminCourseId={selectedCourse?.adminCourseId}
        courseName={selectedCourse?.courseName}
        onSuccess={handleCertificateUploadSuccess}
      />

    </div>
  );
}
