/**
 * User Categorization Service
 * 
 * Categorizes users into proficiency levels based on test results
 * and determines appropriate course difficulty levels for recommendations.
 */

// Proficiency levels based on test scores
// Aligned with frontend display thresholds: Advanced >= 70%, Intermediate 40-69%, Beginner 0-39%
const PROFICIENCY_LEVELS = {
  BEGINNER: {
    key: 'beginner',
    min: 0,
    max: 39,
    label_ar: 'مبتدئ',
    label_en: 'Beginner',
    description_ar: 'يحتاج إلى تأسيس قوي في هذا المجال',
    description_en: 'Needs strong foundation in this area',
    recommended_difficulty: 'beginner',
    color: '#EF4444' // red
  },
  INTERMEDIATE: {
    key: 'intermediate',
    min: 40,
    max: 69,
    label_ar: 'متوسط',
    label_en: 'Intermediate',
    description_ar: 'لديه أساس جيد ويمكنه التطور أكثر',
    description_en: 'Has good foundation and can develop further',
    recommended_difficulty: 'intermediate',
    color: '#F59E0B' // amber
  },
  ADVANCED: {
    key: 'advanced',
    min: 70,
    max: 100,
    label_ar: 'متقدم',
    label_en: 'Advanced',
    description_ar: 'أداء ممتاز، يمكنه التخصص أكثر',
    description_en: 'Excellent performance, can specialize further',
    recommended_difficulty: 'advanced',
    color: '#10B981' // green
  }
};

/**
 * Categorize user based on overall test score
 * @param {number} score - Overall test score (0-100)
 * @returns {Object} Proficiency level object
 */
function categorizeByTestResult(score) {
  const numericScore = parseFloat(score) || 0;
  
  // Advanced: 70-100%, Intermediate: 40-69%, Beginner: 0-39%
  if (numericScore >= PROFICIENCY_LEVELS.ADVANCED.min) {
    return { ...PROFICIENCY_LEVELS.ADVANCED };
  } else if (numericScore >= PROFICIENCY_LEVELS.INTERMEDIATE.min) {
    return { ...PROFICIENCY_LEVELS.INTERMEDIATE };
  } else {
    return { ...PROFICIENCY_LEVELS.BEGINNER };
  }
}

/**
 * Categorize individual skill gaps and determine per-skill recommendations
 * @param {Array} gaps - Array of skill gap objects from analysis
 * @returns {Array} Categorized gaps with proficiency info
 */
function categorizeSkillGaps(gaps) {
  if (!Array.isArray(gaps)) return [];
  
  return gaps.map(gap => {
    const gapScore = gap.gap_score || gap.gap_percentage || 0;
    const proficiency = 100 - gapScore;
    const category = categorizeByTestResult(proficiency);
    
    return {
      ...gap,
      proficiency_score: proficiency,
      category: category.key,
      category_label_ar: category.label_ar,
      category_label_en: category.label_en,
      recommended_difficulty: category.recommended_difficulty,
      needs_training: gapScore > 0
    };
  });
}

/**
 * Determine appropriate course difficulty based on user category
 * @param {string} categoryKey - The proficiency category key
 * @returns {string} Recommended course difficulty level
 */
function determineCourseDifficulty(categoryKey) {
  const difficultyMap = {
    'beginner': 'beginner',
    'intermediate': 'intermediate',
    'advanced': 'advanced'
  };
  return difficultyMap[categoryKey] || 'intermediate';
}

/**
 * Get all valid difficulty levels for a user category
 * Users can take courses at their level or below
 * @param {string} categoryKey - The proficiency category key
 * @returns {Array} Array of valid difficulty levels
 */
function getValidDifficultyLevels(categoryKey) {
  switch (categoryKey) {
    case 'advanced':
      return ['advanced', 'intermediate', 'beginner'];
    case 'intermediate':
      return ['intermediate', 'beginner'];
    case 'beginner':
    default:
      return ['beginner'];
  }
}

/**
 * Calculate priority for skill development based on gap analysis
 * @param {Object} gap - Skill gap object
 * @param {string} categoryKey - User's proficiency category
 * @returns {number} Priority score (1 = highest priority)
 */
function calculateSkillPriority(gap, categoryKey) {
  const gapScore = gap.gap_score || gap.gap_percentage || 0;
  
  // Higher gaps get higher priority (lower number)
  if (gapScore >= 60) return 1; // Critical gap
  if (gapScore >= 40) return 2; // High priority
  if (gapScore >= 20) return 3; // Medium priority
  return 4; // Low priority
}

/**
 * Generate a comprehensive user profile based on test results
 * @param {Object} analysisResult - The analysis result object
 * @returns {Object} Comprehensive user profile for recommendations
 */
function generateUserProfile(analysisResult) {
  const overallScore = analysisResult.overall_score || 0;
  const category = categorizeByTestResult(overallScore);
  const categorizedGaps = categorizeSkillGaps(analysisResult.gaps || []);
  
  // Calculate priority gaps (those needing immediate attention)
  const priorityGaps = categorizedGaps
    .filter(g => g.needs_training)
    .map(g => ({
      ...g,
      priority: calculateSkillPriority(g, category.key)
    }))
    .sort((a, b) => a.priority - b.priority);
  
  return {
    user_id: analysisResult.user_id,
    test_id: analysisResult.test_id,
    overall_score: overallScore,
    category: category,
    categorized_gaps: categorizedGaps,
    priority_gaps: priorityGaps,
    valid_difficulty_levels: getValidDifficultyLevels(category.key),
    strengths: analysisResult.strengths || [],
    analyzed_at: analysisResult.analyzed_at
  };
}

/**
 * Generate recommendation reason text
 * @param {Object} params - Parameters for generating reason
 * @returns {Object} Recommendation reason object
 */
function generateRecommendationReason(params) {
  const {
    exam_name_ar,
    exam_name_en,
    exam_id,
    analyzed_at,
    user_category,
    matching_skills = [],
    skill_gap_score,
    course_difficulty
  } = params;
  
  // Build detailed reason
  let reason_ar = `تم التوصية بهذه الدورة بناءً على نتائج اختبار "${exam_name_ar}"`;
  let reason_en = `Recommended based on test results from "${exam_name_en}"`;
  
  // Add skill-specific context if available
  if (matching_skills.length > 0) {
    const skillsText = matching_skills.slice(0, 3).join('، ');
    reason_ar += ` لتطوير مهارات: ${skillsText}`;
    reason_en += ` to develop skills: ${matching_skills.slice(0, 3).join(', ')}`;
  }
  
  // Add difficulty context
  if (user_category && course_difficulty) {
    const difficultyMatch = user_category.recommended_difficulty === course_difficulty;
    if (difficultyMatch) {
      reason_ar += `. مستوى الدورة (${course_difficulty === 'beginner' ? 'مبتدئ' : course_difficulty === 'intermediate' ? 'متوسط' : 'متقدم'}) مناسب لمستواك`;
      reason_en += `. Course difficulty (${course_difficulty}) matches your level`;
    }
  }
  
  return {
    exam_id,
    exam_name_ar,
    exam_name_en,
    exam_date: analyzed_at,
    user_category: user_category ? {
      key: user_category.key,
      label_ar: user_category.label_ar,
      label_en: user_category.label_en
    } : null,
    matching_skills,
    skill_gap_score,
    reason_ar,
    reason_en
  };
}

module.exports = {
  PROFICIENCY_LEVELS,
  categorizeByTestResult,
  categorizeSkillGaps,
  determineCourseDifficulty,
  getValidDifficultyLevels,
  calculateSkillPriority,
  generateUserProfile,
  generateRecommendationReason
};
