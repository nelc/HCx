import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrophyIcon,
  UserGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../utils/api';

function PeerRankings() {
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const response = await api.get('/dashboard/employee/rankings');
        setRankings(response.data);
      } catch (error) {
        console.error('Failed to fetch rankings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, []);

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-32 mb-4"></div>
        <div className="space-y-3">
          <div className="h-24 bg-slate-100 rounded"></div>
          <div className="h-24 bg-slate-100 rounded"></div>
          <div className="h-24 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!rankings) return null;

  const getRankSuffix = (rank) => {
    if (rank === 1) return 'الأول';
    if (rank === 2) return 'الثاني';
    if (rank === 3) return 'الثالث';
    if (rank === 4) return 'الرابع';
    if (rank === 5) return 'الخامس';
    if (rank === 6) return 'السادس';
    if (rank === 7) return 'السابع';
    if (rank === 8) return 'الثامن';
    if (rank === 9) return 'التاسع';
    if (rank === 10) return 'العاشر';
    return `${rank}`;
  };

  const getRankColor = (rank, total) => {
    const percentile = (rank / total) * 100;
    if (percentile <= 10) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (percentile <= 25) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (percentile <= 50) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-slate-600 bg-slate-50 border-slate-200';
  };

  const hasAnyData = rankings.department_ranking || 
                      rankings.overall_ranking || 
                      (rankings.domain_rankings && rankings.domain_rankings.length > 0) || 
                      (rankings.skill_rankings && rankings.skill_rankings.length > 0);

  if (!hasAnyData) {
    return null;
  }

  return (
    <div className="card">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <TrophyIcon className="w-6 h-6 text-primary-600" />
          <h2 className="text-lg font-semibold text-primary-700">ترتيبك بين الزملاء</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">قارن أداءك مع زملائك في القسم والمجالات</p>
      </div>

      <div className="p-6 space-y-4">
        {/* Department Ranking */}
        {rankings.department_ranking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border-2 ${getRankColor(
              rankings.department_ranking.rank,
              rankings.department_ranking.total_peers
            )}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5" />
                <span className="font-semibold">ترتيب القسم</span>
              </div>
              <span className="text-2xl font-bold">
                {getRankSuffix(rankings.department_ranking.rank)}
              </span>
            </div>
            <p className="text-sm">
              أنت في المرتبة <strong>{rankings.department_ranking.rank}</strong> من أصل{' '}
              <strong>{rankings.department_ranking.total_peers}</strong> موظف في {rankings.user_info.department_name_ar}
            </p>
            <div className="mt-3 flex items-center gap-3 text-sm flex-wrap">
              <span className="px-3 py-1 bg-white rounded-lg">
                متوسط الدرجات: <strong>{rankings.department_ranking.avg_score}%</strong>
              </span>
              <span className="px-3 py-1 bg-white rounded-lg">
                {rankings.department_ranking.assessment_count} تقييم
              </span>
            </div>
          </motion.div>
        )}

        {/* Overall Organization Ranking */}
        {rankings.overall_ranking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 rounded-xl bg-gradient-to-br from-primary-50 to-accent-50 border-2 border-primary-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-primary-600" />
                <span className="font-semibold text-primary-700">الترتيب العام</span>
              </div>
              <span className="text-2xl font-bold text-primary-700">
                {getRankSuffix(rankings.overall_ranking.overall_rank)}
              </span>
            </div>
            <p className="text-sm text-primary-700">
              أنت في المرتبة <strong>{rankings.overall_ranking.overall_rank}</strong> من أصل{' '}
              <strong>{rankings.overall_ranking.total_employees}</strong> موظف في المنظمة
            </p>
            <div className="mt-3 flex items-center gap-3 text-sm flex-wrap">
              <span className="px-3 py-1 bg-white rounded-lg text-primary-700">
                متوسط الدرجات: <strong>{rankings.overall_ranking.avg_score}%</strong>
              </span>
            </div>
          </motion.div>
        )}

        {/* Domain Rankings */}
        {rankings.domain_rankings && rankings.domain_rankings.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 mt-4">ترتيبك في المجالات</h3>
            {rankings.domain_rankings.map((domain, index) => (
              <motion.div
                key={domain.domain_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
                className="p-3 rounded-lg border border-slate-200 hover:border-primary-300 transition-colors"
                style={{ backgroundColor: `${domain.domain_color}10` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: domain.domain_color }}
                      ></div>
                      <span className="font-medium text-slate-800">{domain.domain_name_ar}</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      المرتبة <strong>{domain.domain_rank}</strong> من{' '}
                      <strong>{domain.total_in_domain}</strong> • متوسط:{' '}
                      <strong>{domain.avg_domain_score}%</strong> • {domain.skills_assessed} مهارة
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-lg font-bold"
                      style={{ color: domain.domain_color }}
                    >
                      #{domain.domain_rank}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Top Skill Rankings */}
        {rankings.skill_rankings && rankings.skill_rankings.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 mt-4">ترتيبك في المهارات</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rankings.skill_rankings.slice(0, 6).map((skill, index) => (
                <motion.div
                  key={skill.skill_id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="p-3 rounded-lg border border-slate-200 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {skill.skill_name_ar}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {skill.domain_name_ar}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold" style={{ color: skill.domain_color }}>
                        #{skill.skill_rank}
                      </span>
                      <p className="text-xs text-slate-500">
                        من {skill.total_assessed}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600">نقاطك</span>
                      <span className="font-semibold">{Math.round(skill.last_assessment_score)}%</span>
                    </div>
                    <div className="progress-bar h-1.5">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${skill.last_assessment_score}%`,
                          backgroundColor: skill.domain_color,
                        }}
                      ></div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* No Data State */}
        {!hasAnyData && (
          <div className="text-center py-8 text-slate-500">
            <TrophyIcon className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>لا توجد بيانات كافية لحساب الترتيب</p>
            <p className="text-sm mt-1">أكمل تقييماتك لرؤية ترتيبك</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PeerRankings;

