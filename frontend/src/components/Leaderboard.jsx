import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrophyIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  SparklesIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  FireIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  TrophyIcon as TrophySolidIcon,
  StarIcon as StarSolidIcon,
} from '@heroicons/react/24/solid';
import api from '../utils/api';

// Medal icons for top 3
function MedalIcon({ rank, size = 'md' }) {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const colors = {
    1: 'text-yellow-500',
    2: 'text-slate-400',
    3: 'text-amber-700'
  };

  if (rank > 3) {
    return (
      <span className={`${sizes[size]} rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm`}>
        {rank}
      </span>
    );
  }

  return (
    <div className={`${sizes[size]} ${colors[rank]} relative`}>
      {rank === 1 ? (
        <TrophySolidIcon className="w-full h-full" />
      ) : (
        <StarSolidIcon className="w-full h-full" />
      )}
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
        {rank}
      </span>
    </div>
  );
}

// Leaderboard entry component
function LeaderboardEntry({ entry, currentUserId, showDepartment = false }) {
  const isCurrentUser = entry.user_id === currentUserId || entry.is_current_user;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isCurrentUser 
          ? 'bg-gradient-to-l from-primary-100 to-primary-50 border-2 border-primary-300 shadow-md' 
          : 'bg-white hover:bg-slate-50 border border-slate-100'
      }`}
    >
      <MedalIcon rank={entry.rank} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-semibold truncate ${isCurrentUser ? 'text-primary-700' : 'text-slate-800'}`}>
            {entry.name_ar}
            {isCurrentUser && (
              <span className="mr-2 text-xs bg-primary-200 text-primary-700 px-2 py-0.5 rounded-full">
                أنت
              </span>
            )}
          </p>
        </div>
        {showDepartment && entry.department_name_ar && (
          <p className="text-xs text-slate-500 truncate">{entry.department_name_ar}</p>
        )}
        {entry.job_title_ar && !showDepartment && (
          <p className="text-xs text-slate-500 truncate">{entry.job_title_ar}</p>
        )}
      </div>

      <div className="text-left">
        <p className={`text-lg font-bold ${
          entry.avg_score >= 80 ? 'text-success-600' :
          entry.avg_score >= 60 ? 'text-warning-600' : 'text-slate-600'
        }`}>
          {entry.avg_score}%
        </p>
        <p className="text-xs text-slate-400">{entry.assessment_count} تقييم</p>
      </div>
    </motion.div>
  );
}

// User position banner
function UserPositionBanner({ position, total, type = 'department' }) {
  if (!position) return null;

  const percentile = Math.round(((total - position.rank + 1) / total) * 100);
  const isTopTen = percentile >= 90;
  const isTopQuarter = percentile >= 75;
  const isAboveAverage = percentile >= 50;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl text-center ${
        isTopTen ? 'bg-gradient-to-l from-yellow-100 to-amber-50 border-2 border-yellow-300' :
        isTopQuarter ? 'bg-gradient-to-l from-emerald-100 to-green-50 border-2 border-emerald-300' :
        isAboveAverage ? 'bg-gradient-to-l from-blue-100 to-sky-50 border-2 border-blue-300' :
        'bg-gradient-to-l from-slate-100 to-slate-50 border-2 border-slate-300'
      }`}
    >
      <div className="flex items-center justify-center gap-3 mb-2">
        {isTopTen && <TrophySolidIcon className="w-6 h-6 text-yellow-500" />}
        <span className="text-3xl font-bold">
          {position.rank}
        </span>
        <span className="text-slate-600">من {total}</span>
      </div>
      <p className={`text-sm font-medium ${
        isTopTen ? 'text-yellow-700' :
        isTopQuarter ? 'text-emerald-700' :
        isAboveAverage ? 'text-blue-700' : 'text-slate-600'
      }`}>
        {isTopTen ? 'نخبة الأفضل! 🏆' :
         isTopQuarter ? 'أداء متميز!' :
         isAboveAverage ? 'فوق المتوسط' : 'استمر في التحسن'}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        متوسط درجاتك: <strong>{position.avg_score}%</strong>
      </p>
    </motion.div>
  );
}

// Domain mini leaderboard
function DomainLeaderboard({ domain, currentUserId }) {
  return (
    <div 
      className="p-4 rounded-xl border border-slate-200 hover:border-primary-300 transition-colors"
      style={{ backgroundColor: `${domain.domain_color}08` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div 
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: domain.domain_color }}
        />
        <h4 className="font-semibold text-slate-800">{domain.domain_name_ar}</h4>
      </div>
      
      <div className="space-y-2">
        {domain.leaders.slice(0, 3).map((leader, idx) => (
          <div 
            key={leader.user_id}
            className={`flex items-center gap-2 p-2 rounded-lg ${
              leader.is_current_user ? 'bg-primary-100 border border-primary-200' : 'bg-white'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              idx === 0 ? 'bg-yellow-100 text-yellow-700' :
              idx === 1 ? 'bg-slate-100 text-slate-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {idx + 1}
            </span>
            <span className={`flex-1 text-sm truncate ${leader.is_current_user ? 'font-semibold text-primary-700' : 'text-slate-700'}`}>
              {leader.name_ar}
              {leader.is_current_user && <span className="text-xs mr-1">(أنت)</span>}
            </span>
            <span className="text-sm font-bold" style={{ color: domain.domain_color }}>
              {leader.avg_score}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('department');

  // Fetch leaderboard data with cache-busting timestamp
  const fetchLeaderboard = async () => {
    try {
      const timestamp = Date.now();
      const response = await api.get(`/dashboard/employee/leaderboard?_t=${timestamp}`);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="p-6 border-b border-slate-100">
          <div className="h-6 bg-slate-200 rounded w-40"></div>
        </div>
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-8 text-center">
        <TrophyIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">لا تتوفر بيانات التصنيف حالياً</p>
      </div>
    );
  }

  const tabs = [
    { id: 'department', label: 'القسم', icon: UserGroupIcon },
    { id: 'organization', label: 'المنظمة', icon: BuildingOffice2Icon },
    { id: 'domains', label: 'المجالات', icon: ChartBarIcon },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-l from-primary-600 to-primary-700 p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <TrophyIcon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold">لوحة المتصدرين</h2>
            <p className="text-white/80 text-sm">قارن أداءك مع زملائك</p>
          </div>
        </div>

        {/* Percentile Badge */}
        {data.user_stats?.percentile && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5" />
              <span>أنت ضمن أفضل</span>
            </div>
            <span className="text-2xl font-bold">
              {100 - data.user_stats.percentile + 1}%
            </span>
          </div>
        )}

        {/* Score trend */}
        {data.user_stats?.score_change !== 0 && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            {data.user_stats.score_change > 0 ? (
              <>
                <ArrowTrendingUpIcon className="w-4 h-4 text-green-300" />
                <span className="text-green-200">+{data.user_stats.score_change}% تحسن</span>
              </>
            ) : (
              <>
                <ArrowTrendingDownIcon className="w-4 h-4 text-red-300" />
                <span className="text-red-200">{data.user_stats.score_change}%</span>
              </>
            )}
            <span className="text-white/60">مقارنة بالشهر السابق</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.id 
                ? 'text-primary-700' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* Department Tab */}
          {activeTab === 'department' && (
            <motion.div
              key="department"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-700">
                  ترتيب {data.user_info?.department_name_ar || 'القسم'}
                </h3>
                <span className="text-sm text-slate-500">
                  {data.department_leaderboard?.total_in_dept || 0} موظف
                </span>
              </div>

              <UserPositionBanner 
                position={data.department_leaderboard?.user_position}
                total={data.department_leaderboard?.total_in_dept}
                type="department"
              />

              <div className="space-y-2 mt-4">
                {data.department_leaderboard?.leaders?.map((entry, idx) => (
                  <LeaderboardEntry 
                    key={entry.user_id} 
                    entry={{ ...entry, rank: idx + 1 }}
                    currentUserId={data.user_info?.id}
                  />
                ))}
                {(!data.department_leaderboard?.leaders || data.department_leaderboard.leaders.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <UserGroupIcon className="w-10 h-10 mx-auto mb-2" />
                    <p>لا توجد بيانات كافية</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Organization Tab */}
          {activeTab === 'organization' && (
            <motion.div
              key="organization"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-700">ترتيب المنظمة</h3>
                <span className="text-sm text-slate-500">
                  {data.organization_leaderboard?.total_employees || 0} موظف
                </span>
              </div>

              <UserPositionBanner 
                position={data.organization_leaderboard?.user_position}
                total={data.organization_leaderboard?.total_employees}
                type="organization"
              />

              <div className="space-y-2 mt-4">
                {data.organization_leaderboard?.leaders?.map((entry, idx) => (
                  <LeaderboardEntry 
                    key={entry.user_id} 
                    entry={{ ...entry, rank: idx + 1 }}
                    currentUserId={data.user_info?.id}
                    showDepartment
                  />
                ))}
                {(!data.organization_leaderboard?.leaders || data.organization_leaderboard.leaders.length === 0) && (
                  <div className="text-center py-8 text-slate-400">
                    <BuildingOffice2Icon className="w-10 h-10 mx-auto mb-2" />
                    <p>لا توجد بيانات كافية</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Domains Tab */}
          {activeTab === 'domains' && (
            <motion.div
              key="domains"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <h3 className="font-semibold text-slate-700 mb-4">أفضل 3 في كل مجال</h3>

              {data.domain_leaderboards?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.domain_leaderboards.map(domain => (
                    <DomainLeaderboard 
                      key={domain.domain_id} 
                      domain={domain}
                      currentUserId={data.user_info?.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <ChartBarIcon className="w-10 h-10 mx-auto mb-2" />
                  <p>لا توجد بيانات مجالات كافية</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

