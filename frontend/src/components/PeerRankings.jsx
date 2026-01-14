import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrophyIcon,
  UserGroupIcon,
  SparklesIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  StarIcon,
  FireIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import {
  TrophyIcon as TrophySolidIcon,
  StarIcon as StarSolidIcon,
} from '@heroicons/react/24/solid';
import api from '../utils/api';

// Rank badge component with visual enhancements
function RankBadge({ rank, total }) {
  const percentile = ((total - rank + 1) / total) * 100;
  
  const getRankStyle = () => {
    if (rank === 1) return { bg: 'bg-gradient-to-br from-yellow-400 to-amber-500', text: 'text-white', icon: '🥇' };
    if (rank === 2) return { bg: 'bg-gradient-to-br from-slate-300 to-slate-400', text: 'text-white', icon: '🥈' };
    if (rank === 3) return { bg: 'bg-gradient-to-br from-amber-600 to-amber-700', text: 'text-white', icon: '🥉' };
    if (percentile >= 90) return { bg: 'bg-gradient-to-br from-purple-500 to-purple-600', text: 'text-white', icon: '⭐' };
    if (percentile >= 75) return { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', text: 'text-white', icon: '✨' };
    return { bg: 'bg-slate-200', text: 'text-slate-700', icon: null };
  };

  const style = getRankStyle();

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`relative w-12 h-12 rounded-full ${style.bg} flex items-center justify-center shadow-lg`}
    >
      <span className={`text-lg font-bold ${style.text}`}>{rank}</span>
      {style.icon && (
        <span className="absolute -top-1 -right-1 text-lg">{style.icon}</span>
      )}
    </motion.div>
  );
}

// Percentile indicator bar
function PercentileBar({ percentile }) {
  const getColor = () => {
    if (percentile >= 90) return 'from-yellow-400 to-amber-500';
    if (percentile >= 75) return 'from-emerald-400 to-green-500';
    if (percentile >= 50) return 'from-blue-400 to-blue-500';
    return 'from-slate-300 to-slate-400';
  };

  return (
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percentile}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className={`absolute inset-y-0 left-0 bg-gradient-to-l ${getColor()} rounded-full`}
      />
    </div>
  );
}

// Compact ranking card
function CompactRankCard({ title, rank, total, avgScore, icon: Icon, color }) {
  const percentile = Math.round(((total - rank + 1) / total) * 100);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border-2 ${color.border} ${color.bg}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${color.iconBg}`}>
            <Icon className={`w-4 h-4 ${color.icon}`} />
          </div>
          <span className={`text-sm font-semibold ${color.text}`}>{title}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${color.badge}`}>
          أفضل {100 - percentile + 1}%
        </span>
      </div>
      
      <div className="flex items-end justify-between">
        <div>
          <span className={`text-3xl font-bold ${color.accent}`}>{rank}</span>
          <span className="text-slate-400 text-sm mr-1">من {total}</span>
        </div>
        <div className="text-left">
          <span className={`text-lg font-bold ${color.accent}`}>{avgScore}%</span>
          <p className="text-xs text-slate-400">متوسط الدرجات</p>
        </div>
      </div>

      <div className="mt-3">
        <PercentileBar percentile={percentile} />
      </div>
    </motion.div>
  );
}

// Domain skill ranking item
function DomainSkillItem({ domain, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-3 rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-sm transition-all"
      style={{ backgroundColor: `${domain.domain_color}08` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: domain.domain_color }}
          >
            #{domain.domain_rank}
          </div>
          <div>
            <p className="font-medium text-slate-800">{domain.domain_name_ar}</p>
            <p className="text-xs text-slate-500">
              من {domain.total_in_domain} موظف • {domain.skills_assessed} مهارة
            </p>
          </div>
        </div>
        <div className="text-left">
          <span
            className="text-xl font-bold"
            style={{ color: domain.domain_color }}
          >
            {domain.avg_domain_score}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Skill ranking card
function SkillRankCard({ skill, index }) {
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-success-600';
    if (score >= 60) return 'text-warning-600';
    return 'text-danger-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="p-3 rounded-xl bg-white border border-slate-200 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {skill.skill_name_ar}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: skill.domain_color }}
            />
            <p className="text-xs text-slate-500 truncate">{skill.domain_name_ar}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg">
          <span className="text-xs font-bold text-slate-600">#{skill.skill_rank}</span>
          <span className="text-xs text-slate-400">/{skill.total_assessed}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${skill.last_assessment_score}%` }}
            transition={{ duration: 0.8, delay: index * 0.1 }}
            className="h-full rounded-full"
            style={{ backgroundColor: skill.domain_color }}
          />
        </div>
        <span className={`text-sm font-bold ${getScoreColor(skill.last_assessment_score)}`}>
          {Math.round(skill.last_assessment_score)}%
        </span>
      </div>

      {skill.current_level && (
        <div className="mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            skill.current_level === 'high' 
              ? 'bg-success-100 text-success-700'
              : skill.current_level === 'medium'
              ? 'bg-warning-100 text-warning-700'
              : 'bg-danger-100 text-danger-700'
          }`}>
            {skill.current_level === 'high' ? 'متقدم' : skill.current_level === 'medium' ? 'متوسط' : 'مبتدئ'}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function PeerRankings() {
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-32 bg-slate-100 rounded-xl"></div>
          <div className="h-32 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!rankings) return null;

  const hasAnyData = rankings.department_ranking || 
                      rankings.overall_ranking || 
                      (rankings.domain_rankings && rankings.domain_rankings.length > 0) || 
                      (rankings.skill_rankings && rankings.skill_rankings.length > 0);

  if (!hasAnyData) {
    return (
      <div className="card p-8 text-center">
        <TrophyIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">لا توجد بيانات تصنيف بعد</p>
        <p className="text-sm text-slate-400 mt-1">أكمل تقييماتك لترى ترتيبك بين الزملاء</p>
      </div>
    );
  }

  const deptRank = rankings.department_ranking;
  const orgRank = rankings.overall_ranking;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-l from-primary-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 rounded-xl">
            <TrophyIcon className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary-700">ترتيبك بين الزملاء</h2>
            <p className="text-sm text-slate-500">قارن أداءك مع زملائك في القسم والمنظمة</p>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex border-b border-slate-100 px-4 bg-slate-50">
        {[
          { id: 'overview', label: 'نظرة عامة', icon: ChartBarIcon },
          { id: 'domains', label: 'المجالات', icon: SparklesIcon },
          { id: 'skills', label: 'المهارات', icon: StarIcon },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeSection === tab.id 
                ? 'text-primary-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeSection === tab.id && (
              <motion.div
                layoutId="activeRankTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
              />
            )}
          </button>
        ))}
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Department Ranking */}
                {deptRank && (
                  <CompactRankCard
                    title={`ترتيب ${rankings.user_info.department_name_ar || 'القسم'}`}
                    rank={deptRank.rank}
                    total={deptRank.total_peers}
                    avgScore={deptRank.avg_score}
                    icon={UserGroupIcon}
                    color={{
                      bg: 'bg-gradient-to-br from-blue-50 to-sky-50',
                      border: 'border-blue-200',
                      iconBg: 'bg-blue-100',
                      icon: 'text-blue-600',
                      text: 'text-blue-700',
                      accent: 'text-blue-600',
                      badge: 'bg-blue-100 text-blue-700'
                    }}
                  />
                )}

                {/* Organization Ranking */}
                {orgRank && (
                  <CompactRankCard
                    title="الترتيب العام"
                    rank={orgRank.overall_rank}
                    total={orgRank.total_employees}
                    avgScore={orgRank.avg_score}
                    icon={SparklesIcon}
                    color={{
                      bg: 'bg-gradient-to-br from-primary-50 to-purple-50',
                      border: 'border-primary-200',
                      iconBg: 'bg-primary-100',
                      icon: 'text-primary-600',
                      text: 'text-primary-700',
                      accent: 'text-primary-600',
                      badge: 'bg-primary-100 text-primary-700'
                    }}
                  />
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-primary-600">{deptRank?.assessment_count || orgRank?.assessment_count || 0}</p>
                  <p className="text-xs text-slate-500">تقييم مكتمل</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-success-600">{rankings.domain_rankings?.length || 0}</p>
                  <p className="text-xs text-slate-500">مجال مقيّم</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-accent-600">{rankings.skill_rankings?.length || 0}</p>
                  <p className="text-xs text-slate-500">مهارة مقيّمة</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-warning-600">
                    {deptRank ? `${Math.round(((deptRank.total_peers - deptRank.rank + 1) / deptRank.total_peers) * 100)}%` : '-'}
                  </p>
                  <p className="text-xs text-slate-500">النسبة المئوية</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Domains Section */}
          {activeSection === 'domains' && (
            <motion.div
              key="domains"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-600 mb-3">ترتيبك في المجالات التدريبية</h3>
              {rankings.domain_rankings && rankings.domain_rankings.length > 0 ? (
                rankings.domain_rankings.map((domain, index) => (
                  <DomainSkillItem key={domain.domain_id} domain={domain} index={index} />
                ))
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <SparklesIcon className="w-10 h-10 mx-auto mb-2" />
                  <p>لا توجد بيانات مجالات بعد</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Skills Section */}
          {activeSection === 'skills' && (
            <motion.div
              key="skills"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-600 mb-3">ترتيبك في المهارات</h3>
              {rankings.skill_rankings && rankings.skill_rankings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {rankings.skill_rankings.map((skill, index) => (
                    <SkillRankCard key={skill.skill_id} skill={skill} index={index} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <StarIcon className="w-10 h-10 mx-auto mb-2" />
                  <p>لا توجد بيانات مهارات بعد</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default PeerRankings;
