const db = require('../db');
const { sendBadgeAwardedEmail, sendBadgeRevokedEmail } = require('./emailService');

// Badge definitions with criteria
const BADGE_DEFINITIONS = {
  top_5: {
    id: 'top_5',
    title_ar: 'نخبة المنظمة',
    title_en: 'Top 5%',
    description_ar: 'ترتيب ضمن أفضل 5% من الموظفين',
    description_en: 'Ranked in the top 5% of employees',
    icon: 'trophy',
    color: 'gold',
    category: 'ranking'
  },
  top_10: {
    id: 'top_10',
    title_ar: 'متفوق',
    title_en: 'Top 10%',
    description_ar: 'ترتيب ضمن أفضل 10% من الموظفين',
    description_en: 'Ranked in the top 10% of employees',
    icon: 'medal',
    color: 'silver',
    category: 'ranking'
  },
  top_20: {
    id: 'top_20',
    title_ar: 'فوق المتوسط',
    title_en: 'Top 20%',
    description_ar: 'ترتيب ضمن أفضل 20% من الموظفين',
    description_en: 'Ranked in the top 20% of employees',
    icon: 'star',
    color: 'bronze',
    category: 'ranking'
  },
  assessments_20: {
    id: 'assessments_20',
    title_ar: 'مقيّم متمرس',
    title_en: '20 Assessments',
    description_ar: 'إكمال 20 تقييم أو أكثر',
    description_en: 'Completed 20 or more assessments',
    icon: 'clipboard',
    color: 'purple',
    category: 'milestone'
  },
  assessments_10: {
    id: 'assessments_10',
    title_ar: 'في الطريق',
    title_en: '10 Assessments',
    description_ar: 'إكمال 10 تقييمات',
    description_en: 'Completed 10 assessments',
    icon: 'clipboard',
    color: 'blue',
    category: 'milestone'
  },
  high_score: {
    id: 'high_score',
    title_ar: 'متميز',
    title_en: 'Excellent Score',
    description_ar: 'الحصول على درجة 95% أو أعلى',
    description_en: 'Achieved a score of 95% or higher',
    icon: 'fire',
    color: 'red',
    category: 'performance'
  },
  skill_master: {
    id: 'skill_master',
    title_ar: 'سيد المهارات',
    title_en: 'Skill Master',
    description_ar: '30 مهارة أو أكثر بمستوى عالي',
    description_en: '30 or more skills at high level',
    icon: 'academic',
    color: 'green',
    category: 'skills'
  },
  rising_star: {
    id: 'rising_star',
    title_ar: 'نجم صاعد',
    title_en: 'Rising Star',
    description_ar: 'تحسن 20% أو أكثر بين الشهرين الأخيرين',
    description_en: '20% or more improvement between last two months',
    icon: 'trending-up',
    color: 'orange',
    category: 'improvement'
  },
  active_learner: {
    id: 'active_learner',
    title_ar: 'متعلم نشط',
    title_en: 'Active Learner',
    description_ar: 'إكمال كورسين أو أكثر في شهر واحد',
    description_en: 'Completed 2 or more courses in one month',
    icon: 'book',
    color: 'teal',
    category: 'learning'
  },
  distinguished_learner: {
    id: 'distinguished_learner',
    title_ar: 'متعلم متميز',
    title_en: 'Distinguished Learner',
    description_ar: 'إكمال 4 كورسات أو أكثر في شهر واحد',
    description_en: 'Completed 4 or more courses in one month',
    icon: 'spark',
    color: 'purple',
    category: 'learning'
  }
};

/**
 * Award a badge to a user and send notification email
 * @param {string} userId - User's ID
 * @param {string} badgeId - Badge identifier
 * @returns {Promise<object>} - Result of the operation
 */
async function awardBadge(userId, badgeId) {
  try {
    const badgeDef = BADGE_DEFINITIONS[badgeId];
    if (!badgeDef) {
      throw new Error(`Unknown badge: ${badgeId}`);
    }

    // Check if user already has this active badge
    const existing = await db.query(
      'SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2 AND status = $3',
      [userId, badgeId, 'active']
    );

    if (existing.rows.length > 0) {
      return { success: true, alreadyHas: true, message: 'User already has this badge' };
    }

    // Insert the badge
    const result = await db.query(`
      INSERT INTO user_badges (user_id, badge_id, title_ar, title_en, description_ar, description_en, icon, color, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId,
      badgeDef.id,
      badgeDef.title_ar,
      badgeDef.title_en,
      badgeDef.description_ar,
      badgeDef.description_en,
      badgeDef.icon,
      badgeDef.color,
      badgeDef.category
    ]);

    const badge = result.rows[0];

    // Get user info for email
    const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      
      // Send email notification
      sendBadgeAwardedEmail(user.email, user.name_ar, badgeDef)
        .then(async (emailResult) => {
          if (emailResult.success) {
            // Mark as notified
            await db.query(
              'UPDATE user_badges SET notified_award = true WHERE id = $1',
              [badge.id]
            );
          }
        })
        .catch(err => console.error('Failed to send badge awarded email:', err));
    }

    // Create in-app notification
    await db.query(`
      INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link, metadata)
      VALUES ($1, 'badge_awarded', $2, $3, $4, $5, '/dashboard', $6)
    `, [
      userId,
      `🏅 وسام جديد: ${badgeDef.title_ar}`,
      `🏅 New Badge: ${badgeDef.title_en}`,
      `تهانينا! حصلت على وسام "${badgeDef.title_ar}"`,
      `Congratulations! You earned the "${badgeDef.title_en}" badge`,
      JSON.stringify({ badge_id: badgeId })
    ]);

    console.log(`Badge "${badgeId}" awarded to user ${userId}`);
    return { success: true, badge };
  } catch (error) {
    console.error('Error awarding badge:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revoke a badge from a user and send notification email
 * @param {string} userId - User's ID
 * @param {string} badgeId - Badge identifier
 * @param {string} reasonAr - Reason in Arabic
 * @param {string} reasonEn - Reason in English
 * @returns {Promise<object>} - Result of the operation
 */
async function revokeBadge(userId, badgeId, reasonAr = 'لم تعد تستوفي معايير هذا الوسام', reasonEn = 'You no longer meet the criteria for this badge') {
  try {
    const badgeDef = BADGE_DEFINITIONS[badgeId];
    if (!badgeDef) {
      throw new Error(`Unknown badge: ${badgeId}`);
    }

    // Check if user has this active badge
    const existing = await db.query(
      'SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2 AND status = $3',
      [userId, badgeId, 'active']
    );

    if (existing.rows.length === 0) {
      return { success: true, didNotHave: true, message: 'User did not have this badge' };
    }

    // Update the badge status to revoked
    const result = await db.query(`
      UPDATE user_badges 
      SET status = 'revoked', revoked_at = NOW(), revoked_reason_ar = $1, revoked_reason_en = $2
      WHERE user_id = $3 AND badge_id = $4 AND status = 'active'
      RETURNING *
    `, [reasonAr, reasonEn, userId, badgeId]);

    const badge = result.rows[0];

    // Get user info for email
    const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      
      // Send email notification
      sendBadgeRevokedEmail(user.email, user.name_ar, {
        ...badgeDef,
        reason_ar: reasonAr
      })
        .then(async (emailResult) => {
          if (emailResult.success) {
            // Mark as notified
            await db.query(
              'UPDATE user_badges SET notified_revoke = true WHERE id = $1',
              [badge.id]
            );
          }
        })
        .catch(err => console.error('Failed to send badge revoked email:', err));
    }

    // Create in-app notification
    await db.query(`
      INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link, metadata)
      VALUES ($1, 'badge_revoked', $2, $3, $4, $5, '/dashboard', $6)
    `, [
      userId,
      `تحديث على الأوسمة`,
      `Badge Update`,
      `تم سحب وسام "${badgeDef.title_ar}". ${reasonAr}`,
      `Badge "${badgeDef.title_en}" was revoked. ${reasonEn}`,
      JSON.stringify({ badge_id: badgeId })
    ]);

    console.log(`Badge "${badgeId}" revoked from user ${userId}`);
    return { success: true, badge };
  } catch (error) {
    console.error('Error revoking badge:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate and update badges for a user based on their current stats
 * @param {string} userId - User's ID
 * @returns {Promise<object>} - Result with awarded and revoked badges
 */
async function updateUserBadges(userId) {
  try {
    const awarded = [];
    const revoked = [];

    // Get user stats
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM analysis_results WHERE user_id = $1) as total_assessments,
        (SELECT MAX(overall_score) FROM analysis_results WHERE user_id = $1) as highest_score,
        (SELECT COUNT(DISTINCT skill_id) FROM employee_skill_profiles WHERE user_id = $1 AND current_level = 'high') as high_level_skills
    `, [userId]);
    const stats = statsResult.rows[0] || {};

    // Get user's percentile ranking
    const rankResult = await db.query(`
      WITH user_scores AS (
        SELECT 
          user_id,
          COALESCE(ROUND(AVG(overall_score), 1), 0) as avg_score
        FROM analysis_results
        GROUP BY user_id
      ),
      ranked AS (
        SELECT 
          user_id,
          avg_score,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC) as rank,
          COUNT(*) OVER () as total
        FROM user_scores
      )
      SELECT 
        rank,
        total,
        CASE WHEN total > 0 THEN ((total - rank + 1)::numeric / total * 100) ELSE 0 END as percentile
      FROM ranked
      WHERE user_id = $1
    `, [userId]);
    const userRank = rankResult.rows[0];

    // Get improvement trend
    const improvementResult = await db.query(`
      WITH monthly_scores AS (
        SELECT 
          TO_CHAR(analyzed_at, 'YYYY-MM') as month,
          ROUND(AVG(overall_score), 1) as avg_score
        FROM analysis_results
        WHERE user_id = $1 AND analyzed_at >= NOW() - INTERVAL '2 months'
        GROUP BY TO_CHAR(analyzed_at, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 2
      )
      SELECT 
        COALESCE((SELECT avg_score FROM monthly_scores ORDER BY month DESC LIMIT 1), 0) -
        COALESCE((SELECT avg_score FROM monthly_scores ORDER BY month ASC LIMIT 1), 0) as score_change
    `, [userId]);
    const scoreChange = improvementResult.rows[0]?.score_change || 0;

    // Get monthly course completions
    const monthlyCoursesResult = await db.query(`
      SELECT COUNT(*) as monthly_courses
      FROM course_completion_certificates
      WHERE user_id = $1
        AND completed_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND completed_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    `, [userId]);
    const monthlyCourses = parseInt(monthlyCoursesResult.rows[0]?.monthly_courses || 0);

    // Get current active badges
    const currentBadgesResult = await db.query(
      'SELECT badge_id FROM user_badges WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );
    const currentBadges = new Set(currentBadgesResult.rows.map(b => b.badge_id));

    // Determine which badges user should have
    const shouldHave = new Set();

    // Ranking badges
    if (userRank && userRank.percentile >= 95) {
      shouldHave.add('top_5');
    } else if (userRank && userRank.percentile >= 90) {
      shouldHave.add('top_10');
    } else if (userRank && userRank.percentile >= 80) {
      shouldHave.add('top_20');
    }

    // Assessment milestones
    if (stats.total_assessments >= 20) {
      shouldHave.add('assessments_20');
    } else if (stats.total_assessments >= 10) {
      shouldHave.add('assessments_10');
    }

    // High score badge
    if (stats.highest_score >= 95) {
      shouldHave.add('high_score');
    }

    // Skill mastery
    if (stats.high_level_skills >= 30) {
      shouldHave.add('skill_master');
    }

    // Improvement badge
    if (scoreChange >= 20) {
      shouldHave.add('rising_star');
    }

    // Monthly course badges
    if (monthlyCourses >= 4) {
      shouldHave.add('distinguished_learner');
    }
    if (monthlyCourses >= 2) {
      shouldHave.add('active_learner');
    }

    // Award new badges
    for (const badgeId of shouldHave) {
      if (!currentBadges.has(badgeId)) {
        const result = await awardBadge(userId, badgeId);
        if (result.success && !result.alreadyHas) {
          awarded.push(badgeId);
        }
      }
    }

    // Revoke badges user no longer qualifies for (except milestone badges which are permanent)
    const permanentBadges = ['assessments_10', 'assessments_20', 'high_score'];
    for (const badgeId of currentBadges) {
      if (!shouldHave.has(badgeId) && !permanentBadges.includes(badgeId)) {
        const result = await revokeBadge(userId, badgeId);
        if (result.success && !result.didNotHave) {
          revoked.push(badgeId);
        }
      }
    }

    return { success: true, awarded, revoked };
  } catch (error) {
    console.error('Error updating user badges:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all active badges for a user
 * @param {string} userId - User's ID
 * @returns {Promise<Array>} - List of active badges
 */
async function getUserBadges(userId) {
  try {
    const result = await db.query(`
      SELECT * FROM user_badges
      WHERE user_id = $1 AND status = 'active'
      ORDER BY awarded_at DESC
    `, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Error getting user badges:', error);
    return [];
  }
}

module.exports = {
  BADGE_DEFINITIONS,
  awardBadge,
  revokeBadge,
  updateUserBadges,
  getUserBadges
};

