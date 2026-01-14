import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrophyIcon,
  StarIcon,
  FireIcon,
  AcademicCapIcon,
  ArrowTrendingUpIcon,
  ClipboardDocumentCheckIcon,
  BookOpenIcon,
  SparklesIcon,
  BoltIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import {
  TrophyIcon as TrophySolidIcon,
  StarIcon as StarSolidIcon,
  FireIcon as FireSolidIcon,
} from '@heroicons/react/24/solid';
import api from '../utils/api';

// Icon mapping
const iconMap = {
  trophy: TrophySolidIcon,
  medal: StarSolidIcon,
  star: StarIcon,
  fire: FireSolidIcon,
  academic: AcademicCapIcon,
  'trending-up': ArrowTrendingUpIcon,
  clipboard: ClipboardDocumentCheckIcon,
  book: BookOpenIcon,
  spark: SparklesIcon,
  bolt: BoltIcon,
  badge: CheckBadgeIcon,
};

// Color mapping
const colorMap = {
  gold: {
    bg: 'bg-gradient-to-br from-yellow-100 to-amber-100',
    border: 'border-yellow-300',
    icon: 'text-yellow-600',
    text: 'text-yellow-800',
    glow: 'shadow-yellow-200',
  },
  silver: {
    bg: 'bg-gradient-to-br from-slate-100 to-gray-100',
    border: 'border-slate-300',
    icon: 'text-slate-500',
    text: 'text-slate-700',
    glow: 'shadow-slate-200',
  },
  bronze: {
    bg: 'bg-gradient-to-br from-amber-100 to-orange-100',
    border: 'border-amber-400',
    icon: 'text-amber-700',
    text: 'text-amber-900',
    glow: 'shadow-amber-200',
  },
  purple: {
    bg: 'bg-gradient-to-br from-purple-100 to-violet-100',
    border: 'border-purple-300',
    icon: 'text-purple-600',
    text: 'text-purple-800',
    glow: 'shadow-purple-200',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-100 to-sky-100',
    border: 'border-blue-300',
    icon: 'text-blue-600',
    text: 'text-blue-800',
    glow: 'shadow-blue-200',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-100 to-green-100',
    border: 'border-emerald-300',
    icon: 'text-emerald-600',
    text: 'text-emerald-800',
    glow: 'shadow-emerald-200',
  },
  red: {
    bg: 'bg-gradient-to-br from-red-100 to-rose-100',
    border: 'border-red-300',
    icon: 'text-red-600',
    text: 'text-red-800',
    glow: 'shadow-red-200',
  },
  orange: {
    bg: 'bg-gradient-to-br from-orange-100 to-amber-100',
    border: 'border-orange-300',
    icon: 'text-orange-600',
    text: 'text-orange-800',
    glow: 'shadow-orange-200',
  },
  teal: {
    bg: 'bg-gradient-to-br from-teal-100 to-cyan-100',
    border: 'border-teal-300',
    icon: 'text-teal-600',
    text: 'text-teal-800',
    glow: 'shadow-teal-200',
  },
};

// Single achievement badge
function AchievementBadge({ achievement, delay = 0 }) {
  const IconComponent = iconMap[achievement.icon] || StarIcon;
  const colors = colorMap[achievement.color] || colorMap.blue;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.05, y: -2 }}
      className={`relative flex flex-col items-center p-4 rounded-2xl border-2 ${colors.bg} ${colors.border} shadow-lg ${colors.glow} cursor-default`}
    >
      {/* Glow effect for top achievements */}
      {achievement.color === 'gold' && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-yellow-200/50 to-transparent animate-pulse" />
      )}
      
      <div className={`relative w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-2`}>
        <IconComponent className={`w-7 h-7 ${colors.icon}`} />
      </div>
      
      <p className={`text-sm font-bold ${colors.text} text-center`}>
        {achievement.title_ar}
      </p>
      
      {achievement.description_ar && (
        <p className="text-xs text-slate-500 text-center mt-1">
          {achievement.description_ar}
        </p>
      )}
    </motion.div>
  );
}

// Stats counter
function StatCounter({ value, label, icon: Icon, color = 'primary', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100"
    >
      <div className={`p-2 rounded-lg bg-${color}-50`}>
        <Icon className={`w-5 h-5 text-${color}-600`} />
      </div>
      <div>
        <p className="text-lg font-bold text-slate-800">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </motion.div>
  );
}

// Streak indicator
function StreakIndicator({ streak }) {
  if (!streak || streak === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-orange-100 to-amber-50 rounded-xl border border-orange-200"
    >
      <div className="flex items-center gap-1">
        {[...Array(Math.min(streak, 5))].map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <FireSolidIcon className="w-5 h-5 text-orange-500" />
          </motion.div>
        ))}
        {streak > 5 && (
          <span className="text-xs text-orange-600 font-bold mr-1">+{streak - 5}</span>
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-orange-700">{streak} تقييم متتالي</p>
        <p className="text-xs text-orange-500">حافظ على الاستمرارية!</p>
      </div>
    </motion.div>
  );
}

// Percentile badge
function PercentileBadge({ percentile }) {
  if (!percentile) return null;

  // Updated thresholds: Top 5%, 10%, 20%
  const getPercentileInfo = (p) => {
    if (p >= 95) return { label: 'نخبة المنظمة', color: 'gold', emoji: '🏆' };
    if (p >= 90) return { label: 'متفوق', color: 'emerald', emoji: '⭐' };
    if (p >= 80) return { label: 'فوق المتوسط', color: 'blue', emoji: '👍' };
    return { label: 'متطور', color: 'slate', emoji: '📈' };
  };

  const info = getPercentileInfo(percentile);
  const topPercent = 100 - percentile + 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-${info.color === 'gold' ? 'yellow' : info.color}-100 border-2 border-${info.color === 'gold' ? 'yellow' : info.color}-300`}
    >
      <span className="text-lg">{info.emoji}</span>
      <span className={`font-bold text-${info.color === 'gold' ? 'yellow' : info.color}-700`}>
        أفضل {topPercent}%
      </span>
      <span className={`text-sm text-${info.color === 'gold' ? 'yellow' : info.color}-600`}>
        ({info.label})
      </span>
    </motion.div>
  );
}

// Main component
export default function AchievementBadges({ achievements, stats, compact = false }) {
  if (!achievements || achievements.length === 0) {
    if (compact) return null;
    
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrophyIcon className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-slate-700">الإنجازات</h3>
        </div>
        <div className="text-center py-8 bg-slate-50 rounded-xl">
          <SparklesIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">أكمل التقييمات لفتح الإنجازات</p>
          <p className="text-xs text-slate-400 mt-1">كل إنجاز يعكس تقدمك المهني</p>
        </div>
      </div>
    );
  }

  if (compact) {
    // Compact view - just show badges inline
    return (
      <div className="flex flex-wrap gap-2">
        {achievements.slice(0, 4).map((achievement, idx) => {
          const IconComponent = iconMap[achievement.icon] || StarIcon;
          const colors = colorMap[achievement.color] || colorMap.blue;
          
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${colors.bg} ${colors.border} border`}
              title={achievement.title_ar}
            >
              <IconComponent className={`w-4 h-4 ${colors.icon}`} />
              <span className={`text-xs font-medium ${colors.text}`}>{achievement.title_ar}</span>
            </motion.div>
          );
        })}
        {achievements.length > 4 && (
          <span className="text-xs text-slate-400 self-center">+{achievements.length - 4} أخرى</span>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-l from-primary-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-xl">
              <TrophyIcon className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary-700">الإنجازات والأوسمة</h2>
              <p className="text-sm text-slate-500">شارات التميز التي حصلت عليها</p>
            </div>
          </div>
          
          {stats?.percentile && <PercentileBadge percentile={stats.percentile} />}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCounter 
              value={stats.total_assessments || 0} 
              label="تقييم مكتمل" 
              icon={ClipboardDocumentCheckIcon}
              color="primary"
              delay={0}
            />
            <StatCounter 
              value={stats.high_level_skills || 0} 
              label="مهارة متقدمة" 
              icon={StarIcon}
              color="success"
              delay={0.1}
            />
            <StatCounter 
              value={stats.completed_trainings || 0} 
              label="تدريب مكتمل" 
              icon={AcademicCapIcon}
              color="accent"
              delay={0.2}
            />
            <StatCounter 
              value={`${stats.avg_score || 0}%`} 
              label="متوسط الأداء" 
              icon={BoltIcon}
              color="warning"
              delay={0.3}
            />
          </div>
        )}

        {/* Streak */}
        {stats?.current_streak > 0 && (
          <StreakIndicator streak={stats.current_streak} />
        )}

        {/* Achievement Badges Grid */}
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-3">الأوسمة المكتسبة</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {achievements.map((achievement, idx) => (
              <AchievementBadge 
                key={achievement.id} 
                achievement={achievement} 
                delay={0.4 + idx * 0.1}
              />
            ))}
          </div>
        </div>

        {/* Score trend */}
        {stats?.score_change !== undefined && stats.score_change !== 0 && (
          <div className={`flex items-center gap-2 p-3 rounded-xl ${
            stats.score_change > 0 
              ? 'bg-success-50 text-success-700' 
              : 'bg-danger-50 text-danger-700'
          }`}>
            <ArrowTrendingUpIcon className={`w-5 h-5 ${stats.score_change < 0 ? 'rotate-180' : ''}`} />
            <span className="font-medium">
              {stats.score_change > 0 ? 'تحسن' : 'انخفاض'} بنسبة {Math.abs(stats.score_change)}%
            </span>
            <span className="text-sm opacity-75">مقارنة بالفترة السابقة</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Export individual components for flexible use
export { AchievementBadge, PercentileBadge, StreakIndicator, StatCounter };

