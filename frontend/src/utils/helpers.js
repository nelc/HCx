// Format date for display
export const formatDate = (date, locale = 'ar-SA') => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Format date with time
export const formatDateTime = (date, locale = 'ar-SA') => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Get relative time (e.g., "منذ 5 دقائق")
export const getRelativeTime = (date) => {
  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((then - now) / 1000);
  
  const intervals = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(Math.abs(diffInSeconds) / interval.seconds);
    if (count >= 1) {
      return rtf.format(diffInSeconds > 0 ? count : -count, interval.unit);
    }
  }
  return 'الآن';
};

// Format percentage
export const formatPercentage = (value, decimals = 0) => {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toFixed(decimals)}%`;
};

// Get skill level label
export const getSkillLevelLabel = (level, lang = 'ar') => {
  const labels = {
    low: { ar: 'منخفض', en: 'Low' },
    medium: { ar: 'متوسط', en: 'Medium' },
    high: { ar: 'مرتفع', en: 'High' },
  };
  return labels[level]?.[lang] || level;
};

// Get skill level color
export const getSkillLevelColor = (level) => {
  const colors = {
    low: 'text-danger-500 bg-danger-50',
    medium: 'text-warning-500 bg-warning-50',
    high: 'text-success-500 bg-success-50',
  };
  return colors[level] || 'text-slate-500 bg-slate-50';
};

// Get status badge color
export const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-slate-100 text-slate-600',
    in_progress: 'bg-blue-100 text-blue-600',
    completed: 'bg-success-50 text-success-600',
    expired: 'bg-danger-50 text-danger-600',
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-success-50 text-success-600',
    closed: 'bg-slate-100 text-slate-600',
    archived: 'bg-slate-100 text-slate-400',
    recommended: 'bg-blue-100 text-blue-600',
    enrolled: 'bg-purple-100 text-purple-600',
    skipped: 'bg-slate-100 text-slate-400',
  };
  return colors[status] || 'bg-slate-100 text-slate-600';
};

// Get status label
export const getStatusLabel = (status, lang = 'ar') => {
  const labels = {
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
    in_progress: { ar: 'جاري', en: 'In Progress' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    expired: { ar: 'منتهي', en: 'Expired' },
    draft: { ar: 'مسودة', en: 'Draft' },
    published: { ar: 'منشور', en: 'Published' },
    closed: { ar: 'مغلق', en: 'Closed' },
    archived: { ar: 'مؤرشف', en: 'Archived' },
    recommended: { ar: 'موصى به', en: 'Recommended' },
    enrolled: { ar: 'مسجل', en: 'Enrolled' },
    skipped: { ar: 'تم تخطيه', en: 'Skipped' },
  };
  return labels[status]?.[lang] || status;
};

// Get role label
export const getRoleLabel = (role, lang = 'ar') => {
  const labels = {
    admin: { ar: 'مدير النظام', en: 'System Admin' },
    training_officer: { ar: 'مسؤول التدريب', en: 'Training Officer' },
    employee: { ar: 'موظف', en: 'Employee' },
  };
  return labels[role]?.[lang] || role;
};

// Truncate text
export const truncate = (text, length = 100) => {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
};

// Get initials from name
export const getInitials = (name) => {
  if (!name) return '';
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

// Calculate time remaining
export const getTimeRemaining = (dueDate) => {
  if (!dueDate) return null;
  
  const now = new Date();
  const due = new Date(dueDate);
  const diff = due - now;
  
  if (diff < 0) return { expired: true, text: 'منتهي' };
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return { expired: false, text: `${days} يوم ${hours > 0 ? `و ${hours} ساعة` : ''}` };
  }
  if (hours > 0) {
    return { expired: false, text: `${hours} ساعة` };
  }
  return { expired: false, text: 'أقل من ساعة' };
};

// Generate random color for charts
export const generateChartColors = (count) => {
  const baseColors = [
    '#0e395e', '#4577af', '#6394c5', '#93b7d9', '#bdd3e9',
    '#ed7a1e', '#f19642', '#f6bb78', '#22c55e', '#f59e0b',
  ];
  
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
};

