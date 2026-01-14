import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Square3Stack3DIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';
import useAuthStore from '../store/authStore';

export default function CompetencyMatrix() {
  const { user } = useAuthStore();
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState(null);

  useEffect(() => {
    fetchMatrix();
  }, []);

  const fetchMatrix = async () => {
    try {
      const response = await api.get(`/analysis/competency-matrix/${user.id}`);
      console.log('[CompetencyMatrix] Received data:', {
        domains: response.data.domains?.length || 0,
        totalSkills: response.data.summary?.total_skills || 0,
        skillsAssessed: response.data.summary?.skills_assessed || 0
      });
      setMatrix(response.data);
      if (response.data.domains.length > 0) {
        setSelectedDomain(response.data.domains[0].domain_id);
      }
    } catch (error) {
      console.error('Failed to fetch competency matrix:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">جاري تحميل مصفوفة الكفاءات...</p>
        </div>
      </div>
    );
  }

  if (!matrix || matrix.domains.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Square3Stack3DIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 mb-2">لا توجد مجالات مهارية</h3>
        <p className="text-slate-500 mb-4">
          {user?.role === 'employee' 
            ? 'لا توجد مجالات تدريبية مرتبطة بقسمك حالياً. يرجى التواصل مع مسؤول التدريب.'
            : 'لا توجد مجالات أو مهارات محددة من قبل الإدارة'}
        </p>
      </div>
    );
  }

  const { domains, summary } = matrix;
  const currentDomain = domains.find(d => d.domain_id === selectedDomain);

  // Derive level from score for consistency
  const getLevelFromScore = (score) => {
    if (score === null || score === undefined) return null;
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  };

  const getLevelLabel = (level) => {
    switch (level) {
      case 'low':
        return 'مبتدئ';
      case 'medium':
        return 'متوسط';
      case 'high':
        return 'متقدم';
      default:
        return 'لم يتم التقييم';
    }
  };

  const getLevelBgColor = (level) => {
    switch (level) {
      case 'low':
        return 'bg-danger-100';
      case 'medium':
        return 'bg-warning-100';
      case 'high':
        return 'bg-success-100';
      default:
        return 'bg-slate-100';
    }
  };

  const getLevelTextColor = (level) => {
    switch (level) {
      case 'low':
        return 'text-danger-700';
      case 'medium':
        return 'text-warning-700';
      case 'high':
        return 'text-success-700';
      default:
        return 'text-slate-500';
    }
  };

  const getScoreColor = (score) => {
    if (score === null || score === undefined) {
      return 'bg-slate-300';
    }
    if (score >= 70) {
      return 'bg-success-500';
    }
    if (score >= 40) {
      return 'bg-warning-500';
    }
    return 'bg-danger-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-700 mb-2">مصفوفة الكفاءات</h1>
        <p className="text-slate-500">خريطة شاملة لمهاراتك ومستوياتها الحالية والمستهدفة</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-50 rounded-xl">
              <Square3Stack3DIcon className="w-6 h-6 text-primary-700" />
            </div>
            <div>
              <p className="text-3xl font-bold text-primary-700">{summary.total_domains}</p>
              <p className="text-sm text-slate-500">المجالات</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-50 rounded-xl">
              <ChartBarIcon className="w-6 h-6 text-accent-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-accent-600">{summary.total_skills}</p>
              <p className="text-sm text-slate-500">إجمالي المهارات</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-success-50 rounded-xl">
              <CheckCircleIcon className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-success-600">{summary.skills_assessed || 0}</p>
              <p className="text-sm text-slate-500">مهارات تم تقييمها</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-secondary-50 rounded-xl">
              <ChartBarIcon className="w-6 h-6 text-secondary-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-secondary-600">{summary.overall_readiness}%</p>
              <p className="text-sm text-slate-500">الجاهزية الإجمالية</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Domain Tabs */}
      <div className="card p-1 flex gap-1 overflow-x-auto">
        {domains.map((domain) => (
          <button
            key={domain.domain_id}
            onClick={() => setSelectedDomain(domain.domain_id)}
            className={`
              px-4 py-3 rounded-lg whitespace-nowrap transition-all flex-shrink-0
              ${selectedDomain === domain.domain_id
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }
            `}
          >
            <div className="font-medium">{domain.domain_name_ar}</div>
            <div className="text-xs mt-1 opacity-80">
              {domain.assessed_skills || 0}/{domain.total_skills} تم تقييمها
            </div>
          </button>
        ))}
      </div>

      {/* Domain Overview */}
      {currentDomain && (
        <motion.div
          key={selectedDomain}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card overflow-hidden"
        >
          <div className="h-2" style={{ backgroundColor: currentDomain.domain_color }}></div>
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">{currentDomain.domain_name_ar}</h2>
                <p className="text-slate-500 mt-1">{currentDomain.domain_name_en}</p>
              </div>
              <div className="text-left">
                <div
                  className="text-5xl font-bold"
                  style={{ color: currentDomain.domain_color }}
                >
                  {currentDomain.proficiency}%
                </div>
                <p className="text-sm text-slate-500 mt-1">مستوى الإتقان</p>
              </div>
            </div>

            {/* Readiness Indicator */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">جاهزية المجال</span>
                <span className="text-sm font-bold text-primary-700">{currentDomain.readiness}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${currentDomain.readiness}%` }}
                  transition={{ duration: 1 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: currentDomain.domain_color }}
                ></motion.div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {currentDomain.skills_at_target} من {currentDomain.total_skills} مهارات وصلت للمستوى المستهدف
              </p>
            </div>

            {/* Skills Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">المهارة</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">المستوى الحالي</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">المستوى المستهدف</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">النتيجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentDomain.skills.map((skill, index) => (
                    <motion.tr
                      key={skill.skill_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {/* Skill Name */}
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-medium text-slate-800">{skill.name_ar}</p>
                          <p className="text-xs text-slate-500">{skill.name_en}</p>
                        </div>
                      </td>

                      {/* Current Level - derived from score for accuracy */}
                      <td className="py-4 px-4 text-center">
                        {(() => {
                          const derivedLevel = getLevelFromScore(skill.score);
                          return (
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getLevelBgColor(derivedLevel)} ${getLevelTextColor(derivedLevel)}`}>
                              {getLevelLabel(derivedLevel)}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Target Level */}
                      <td className="py-4 px-4 text-center">
                        {skill.target_level ? (
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border-2 ${getLevelBgColor(skill.target_level)} ${getLevelTextColor(skill.target_level)}`}>
                            {getLevelLabel(skill.target_level)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">غير محدد</span>
                        )}
                      </td>

                      {/* Score */}
                      <td className="py-4 px-4">
                        <div className="w-full min-w-[200px]">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-slate-700">
                              {skill.score !== null && skill.score !== undefined ? `${skill.score}%` : 'لم يتم التقييم'}
                            </span>
                          </div>
                          <div className="h-6 bg-slate-200 rounded-lg overflow-hidden relative">
                            {skill.score !== null && skill.score !== undefined ? (
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${skill.score}%` }}
                                transition={{ duration: 0.8, delay: index * 0.05 }}
                                className={`h-full ${getScoreColor(skill.score)}`}
                              />
                            ) : (
                              <div className="h-full bg-slate-100 flex items-center justify-center">
                                <span className="text-xs text-slate-400">-</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">مفتاح المستويات</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-danger-100"></div>
                  <span className="text-sm text-slate-600">مبتدئ (0-39%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-warning-100"></div>
                  <span className="text-sm text-slate-600">متوسط (40-69%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-success-100"></div>
                  <span className="text-sm text-slate-600">متقدم (70-100%)</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

    </div>
  );
}




