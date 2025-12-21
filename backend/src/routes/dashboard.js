const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get center-wide dashboard (admin/training officer)
router.get('/center', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Overall statistics
    const stats = await db.query(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM users WHERE role = 'employee' AND is_active = true), 0) as total_employees,
        COALESCE((SELECT COUNT(*) FROM tests WHERE status = 'published'), 0) as active_tests,
        COALESCE((SELECT COUNT(*) FROM test_assignments), 0) as total_assignments,
        COALESCE((SELECT COUNT(*) FROM test_assignments WHERE status = 'completed'), 0) as completed_assignments,
        COALESCE((SELECT COUNT(*) FROM analysis_results), 0) as analyzed_count,
        COALESCE((SELECT COUNT(*) FROM training_recommendations), 0) as total_recommendations
    `);
    
    // Participation rate by department
    const departmentParticipation = await db.query(`
      SELECT 
        d.id,
        d.name_ar,
        d.name_en,
        COUNT(DISTINCT u.id) as employee_count,
        COUNT(DISTINCT ta.id) as assignment_count,
        COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END) as completed_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END)::numeric / 
          NULLIF(COUNT(DISTINCT ta.id), 0) * 100, 1
        ) as completion_rate
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.role = 'employee'
      LEFT JOIN test_assignments ta ON ta.user_id = u.id
      GROUP BY d.id, d.name_ar, d.name_en
      ORDER BY completion_rate DESC NULLS LAST
    `);
    
    // Skill gaps across center
    const skillGaps = await db.query(`
      SELECT 
        s.id,
        s.name_ar,
        s.name_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color,
        COUNT(CASE WHEN esp.current_level = 'low' THEN 1 END) as low_count,
        COUNT(CASE WHEN esp.current_level = 'medium' THEN 1 END) as medium_count,
        COUNT(CASE WHEN esp.current_level = 'high' THEN 1 END) as high_count,
        COUNT(esp.id) as total_assessed,
        ROUND(AVG(esp.last_assessment_score), 1) as avg_score
      FROM skills s
      LEFT JOIN employee_skill_profiles esp ON s.id = esp.skill_id
      JOIN training_domains td ON s.domain_id = td.id
      GROUP BY s.id, s.name_ar, s.name_en, td.name_ar, td.name_en, td.color
      HAVING COUNT(esp.id) > 0
      ORDER BY avg_score ASC NULLS LAST
      LIMIT 10
    `);
    
    // Recent assessments
    const recentAssessments = await db.query(`
      SELECT 
        ar.id,
        ar.overall_score,
        ar.analyzed_at,
        u.name_ar as user_name_ar,
        u.name_en as user_name_en,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en,
        t.title_ar as test_title_ar,
        t.title_en as test_title_en
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ar.test_id = t.id
      ORDER BY ar.analyzed_at DESC
      LIMIT 10
    `);
    
    // Training recommendations distribution
    const recommendationStats = await db.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM training_recommendations
      GROUP BY status
    `);
    
    // Tests by domain
    const testsByDomain = await db.query(`
      SELECT 
        td.id,
        td.name_ar,
        td.name_en,
        td.color,
        COUNT(t.id) as test_count,
        COUNT(DISTINCT ta.user_id) as participants
      FROM training_domains td
      LEFT JOIN tests t ON t.domain_id = td.id AND t.status = 'published'
      LEFT JOIN test_assignments ta ON ta.test_id = t.id AND ta.status = 'completed'
      GROUP BY td.id, td.name_ar, td.name_en, td.color
      ORDER BY test_count DESC
    `);
    
    res.json({
      stats: stats.rows[0],
      department_participation: departmentParticipation.rows,
      skill_gaps: skillGaps.rows,
      recent_assessments: recentAssessments.rows,
      recommendation_stats: recommendationStats.rows,
      tests_by_domain: testsByDomain.rows
    });
  } catch (error) {
    console.error('Get center dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Get department dashboard
router.get('/department/:departmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    // Department info
    const deptInfo = await db.query(`
      SELECT d.*, 
             (SELECT COUNT(*) FROM users WHERE department_id = d.id AND role = 'employee') as employee_count
      FROM departments d WHERE d.id = $1
    `, [departmentId]);
    
    if (deptInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Department statistics
    const stats = await db.query(`
      SELECT
        COUNT(DISTINCT ta.id) as total_assignments,
        COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END) as completed_assignments,
        COUNT(DISTINCT ar.id) as analyzed_count,
        ROUND(AVG(ar.overall_score), 1) as avg_score
      FROM users u
      LEFT JOIN test_assignments ta ON ta.user_id = u.id
      LEFT JOIN analysis_results ar ON ar.user_id = u.id
      WHERE u.department_id = $1 AND u.role = 'employee'
    `, [departmentId]);
    
    // Employee performance
    const employeePerformance = await db.query(`
      SELECT 
        u.id,
        u.name_ar,
        u.name_en,
        u.email,
        COUNT(DISTINCT ta.id) as assignments_count,
        COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END) as completed_count,
        ROUND(AVG(ar.overall_score), 1) as avg_score
      FROM users u
      LEFT JOIN test_assignments ta ON ta.user_id = u.id
      LEFT JOIN analysis_results ar ON ar.user_id = u.id
      WHERE u.department_id = $1 AND u.role = 'employee'
      GROUP BY u.id, u.name_ar, u.name_en, u.email
      ORDER BY avg_score DESC NULLS LAST
    `, [departmentId]);
    
    // Skill distribution
    const skillDistribution = await db.query(`
      SELECT 
        s.id,
        s.name_ar,
        s.name_en,
        td.color as domain_color,
        COUNT(CASE WHEN esp.current_level = 'low' THEN 1 END) as low_count,
        COUNT(CASE WHEN esp.current_level = 'medium' THEN 1 END) as medium_count,
        COUNT(CASE WHEN esp.current_level = 'high' THEN 1 END) as high_count,
        ROUND(AVG(esp.last_assessment_score), 1) as avg_score
      FROM skills s
      JOIN employee_skill_profiles esp ON s.id = esp.skill_id
      JOIN users u ON esp.user_id = u.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE u.department_id = $1
      GROUP BY s.id, s.name_ar, s.name_en, td.color
      ORDER BY avg_score ASC
    `, [departmentId]);
    
    res.json({
      department: deptInfo.rows[0],
      stats: stats.rows[0],
      employee_performance: employeePerformance.rows,
      skill_distribution: skillDistribution.rows
    });
  } catch (error) {
    console.error('Get department dashboard error:', error);
    res.status(500).json({ error: 'Failed to get department dashboard' });
  }
});

// Get employee dashboard (my dashboard)
router.get('/employee', authenticate, async (req, res) => {
  // Set cache-control headers to ensure fresh data
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    const userId = req.user.id;
    
    // My statistics
    const stats = await db.query(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM test_assignments WHERE user_id = $1), 0) as total_assignments,
        COALESCE((SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'completed'), 0) as completed_count,
        COALESCE((SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'pending'), 0) as pending_count,
        COALESCE((SELECT ROUND(AVG(overall_score), 1) FROM analysis_results WHERE user_id = $1), 0) as avg_score,
        COALESCE((SELECT COUNT(*) FROM training_recommendations WHERE user_id = $1), 0) as total_recommendations,
        COALESCE((SELECT COUNT(*) FROM training_recommendations WHERE user_id = $1 AND status = 'completed'), 0) as completed_recommendations
    `, [userId]);
    
    // Pending assignments
    const pendingAssignments = await db.query(`
      SELECT 
        ta.id,
        ta.due_date,
        ta.created_at,
        t.title_ar as test_title_ar,
        t.title_en as test_title_en,
        t.duration_minutes,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color,
        (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as questions_count
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ta.user_id = $1 AND ta.status IN ('pending', 'in_progress')
      ORDER BY ta.due_date ASC NULLS LAST
    `, [userId]);
    
    // My skill profile (assessed skills) - Updated to always return fresh, accurate data
    // Includes improvement trend and last assessment date for better tracking
    const skillProfile = await db.query(`
      SELECT 
        esp.id,
        esp.user_id,
        esp.skill_id,
        esp.current_level,
        esp.target_level,
        esp.last_assessment_score,
        esp.last_assessment_date,
        esp.improvement_trend,
        esp.confidence_score,
        esp.source,
        esp.created_at,
        esp.updated_at,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        s.description_ar as skill_description_ar,
        s.description_en as skill_description_en,
        s.weight as skill_weight,
        td.id as domain_id,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE esp.user_id = $1 
        AND esp.last_assessment_score IS NOT NULL 
        AND esp.last_assessment_score > 0
      ORDER BY esp.last_assessment_date DESC NULLS LAST, esp.last_assessment_score DESC
    `, [userId]);
    
    // Department-linked skills (all skills from domains linked to employee's department)
    const departmentSkills = await db.query(`
      SELECT DISTINCT
        s.id as skill_id,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        s.description_ar as skill_description_ar,
        s.description_en as skill_description_en,
        td.id as domain_id,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color,
        esp.last_assessment_score,
        esp.current_level,
        esp.last_assessment_date
      FROM users u
      INNER JOIN domain_departments dd ON u.department_id = dd.department_id
      INNER JOIN training_domains td ON dd.domain_id = td.id
      INNER JOIN skills s ON s.domain_id = td.id
      LEFT JOIN employee_skill_profiles esp ON esp.skill_id = s.id AND esp.user_id = u.id
      WHERE u.id = $1 AND td.is_active = true
      ORDER BY td.name_ar, s.name_ar
    `, [userId]);
    
    // Recent results
    const recentResults = await db.query(`
      SELECT 
        ar.id,
        ar.overall_score,
        ar.analyzed_at,
        ar.strengths,
        ar.gaps,
        ar.assignment_id,
        t.title_ar as test_title_ar,
        t.title_en as test_title_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM analysis_results ar
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ar.user_id = $1
      ORDER BY ar.analyzed_at DESC
      LIMIT 5
    `, [userId]);
    
    // Calculate correct grades and grading status for recent results
    // Uses same formula as test results in full-profile for consistency
    const recentResultsWithGrades = await Promise.all(recentResults.rows.map(async (result) => {
      if (!result.assignment_id) return result;
      
      // Get open questions grading status
      const gradingStatus = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE q.question_type = 'open_text') as total_open_questions,
          COUNT(*) FILTER (WHERE q.question_type = 'open_text' AND r.score IS NULL) as ungraded_count
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [result.assignment_id]);
      
      const status = gradingStatus.rows[0] || { total_open_questions: 0, ungraded_count: 0 };
      const needsGrading = parseInt(status.ungraded_count) > 0;
      
      // ALWAYS recalculate grade from responses for consistency with competency matrix
      const responsesData = await db.query(`
        SELECT r.score, q.question_type, q.options, q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [result.assignment_id]);
      
      let totalScore = 0;
      let totalMaxScore = 0;
      
      for (const response of responsesData.rows) {
        let maxScore = 10;
        
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        } else if (response.question_type === 'open_text') {
          maxScore = 10;
        }
        
        const weight = parseFloat(response.weight) || 1;
        const score = parseFloat(response.score) || 0;
        
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
      }
      
      const calculatedGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      
      return {
        ...result,
        overall_score: calculatedGrade,
        needs_grading: needsGrading,
        ungraded_count: parseInt(status.ungraded_count),
        total_open_questions: parseInt(status.total_open_questions)
      };
    }));
    
    // Top recommendations
    const recommendations = await db.query(`
      SELECT 
        tr.*,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        td.color as domain_color
      FROM training_recommendations tr
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE tr.user_id = $1 AND tr.status != 'completed'
      ORDER BY tr.priority, tr.created_at DESC
      LIMIT 5
    `, [userId]);
    
    // CV-imported skills (skills extracted from the user's CV)
    const cvSkills = await db.query(`
      SELECT 
        esp.id,
        esp.skill_id,
        esp.current_level,
        esp.confidence_score,
        esp.created_at,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        s.description_ar as skill_description_ar,
        s.description_en as skill_description_en,
        td.id as domain_id,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE esp.user_id = $1 AND esp.source = 'cv_import'
      ORDER BY esp.confidence_score DESC, td.name_ar, s.name_ar
    `, [userId]);
    
    res.json({
      stats: stats.rows[0],
      pending_assignments: pendingAssignments.rows,
      skill_profile: skillProfile.rows,
      department_skills: departmentSkills.rows,
      recent_results: recentResultsWithGrades,
      recommendations: recommendations.rows,
      cv_skills: cvSkills.rows
    });
  } catch (error) {
    console.error('Get employee dashboard error:', error);
    res.status(500).json({ error: 'Failed to get employee dashboard' });
  }
});

// Get quick stats for header
router.get('/quick-stats', authenticate, async (req, res) => {
  // Set cache-control headers to ensure fresh data
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    if (req.user.role === 'employee') {
      const stats = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'pending') as pending_tests,
          (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false) as unread_notifications
      `, [req.user.id]);
      
      res.json(stats.rows[0]);
    } else {
      const stats = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM test_assignments WHERE status = 'completed' AND id NOT IN (SELECT assignment_id FROM analysis_results)) as pending_analysis,
          (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false) as unread_notifications
      `, [req.user.id]);
      
      res.json(stats.rows[0]);
    }
  } catch (error) {
    console.error('Get quick stats error:', error);
    res.status(500).json({ error: 'Failed to get quick stats' });
  }
});

// Get employee peer rankings
router.get('/employee/rankings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's department and associated domains
    const userInfo = await db.query(`
      SELECT 
        u.id,
        u.department_id,
        u.name_ar,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [userId]);

    if (userInfo.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userInfo.rows[0];
    const departmentId = user.department_id;

    // 1. DEPARTMENT RANKING
    // Rank users in the same department by their average assessment score
    const departmentRanking = await db.query(`
      WITH user_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          u.name_en,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.department_id = $1 
          AND u.role = 'employee' 
          AND u.is_active = true
        GROUP BY u.id, u.name_ar, u.name_en
        HAVING COUNT(ar.id) > 0
      ),
      ranked_users AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as rank,
          COUNT(*) OVER () as total_peers
        FROM user_scores
      )
      SELECT * FROM ranked_users
      WHERE user_id = $2
    `, [departmentId, userId]);

    // 2. DOMAIN RANKINGS
    // Get rankings for each domain linked to user's department
    const domainRankings = await db.query(`
      WITH user_domain_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          td.id as domain_id,
          td.name_ar as domain_name_ar,
          td.name_en as domain_name_en,
          td.color as domain_color,
          ROUND(AVG(esp.last_assessment_score), 1) as avg_domain_score,
          COUNT(DISTINCT esp.skill_id) as skills_assessed
        FROM users u
        INNER JOIN domain_departments dd ON u.department_id = dd.department_id
        INNER JOIN training_domains td ON dd.domain_id = td.id
        INNER JOIN skills s ON s.domain_id = td.id
        INNER JOIN employee_skill_profiles esp ON esp.skill_id = s.id AND esp.user_id = u.id
        WHERE dd.department_id = $1 
          AND u.role = 'employee' 
          AND u.is_active = true
          AND esp.last_assessment_score IS NOT NULL
        GROUP BY u.id, u.name_ar, td.id, td.name_ar, td.name_en, td.color
      ),
      domain_ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY domain_id ORDER BY avg_domain_score DESC, skills_assessed DESC) as domain_rank,
          COUNT(*) OVER (PARTITION BY domain_id) as total_in_domain
        FROM user_domain_scores
      )
      SELECT * FROM domain_ranked
      WHERE user_id = $2
      ORDER BY avg_domain_score DESC
    `, [departmentId, userId]);

    // 3. SKILL RANKINGS
    // Get rankings for individual skills
    const skillRankings = await db.query(`
      WITH skill_scores AS (
        SELECT 
          esp.user_id,
          esp.skill_id,
          s.name_ar as skill_name_ar,
          s.name_en as skill_name_en,
          td.name_ar as domain_name_ar,
          td.color as domain_color,
          esp.last_assessment_score,
          esp.current_level
        FROM employee_skill_profiles esp
        INNER JOIN skills s ON s.id = esp.skill_id
        INNER JOIN training_domains td ON s.domain_id = td.id
        INNER JOIN users u ON esp.user_id = u.id
        INNER JOIN domain_departments dd ON u.department_id = dd.department_id AND dd.domain_id = td.id
        WHERE u.department_id = $1 
          AND u.role = 'employee' 
          AND u.is_active = true
          AND esp.last_assessment_score IS NOT NULL
      ),
      skill_ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY skill_id ORDER BY last_assessment_score DESC) as skill_rank,
          COUNT(*) OVER (PARTITION BY skill_id) as total_assessed
        FROM skill_scores
      )
      SELECT * FROM skill_ranked
      WHERE user_id = $2
      ORDER BY last_assessment_score DESC
      LIMIT 10
    `, [departmentId, userId]);

    // 4. OVERALL RANK (across all employees in the organization)
    const overallRanking = await db.query(`
      WITH all_user_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.role = 'employee' AND u.is_active = true
        GROUP BY u.id, u.name_ar
        HAVING COUNT(ar.id) > 0
      ),
      ranked_all AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as overall_rank,
          COUNT(*) OVER () as total_employees
        FROM all_user_scores
      )
      SELECT * FROM ranked_all
      WHERE user_id = $1
    `, [userId]);

    res.json({
      department_ranking: departmentRanking.rows[0] || null,
      domain_rankings: domainRankings.rows || [],
      skill_rankings: skillRankings.rows || [],
      overall_ranking: overallRanking.rows[0] || null,
      user_info: {
        name_ar: user.name_ar,
        department_name_ar: user.department_name_ar
      }
    });
  } catch (error) {
    console.error('Get employee rankings error:', error);
    res.status(500).json({ error: 'Failed to get employee rankings' });
  }
});

// Get comprehensive HR insights dashboard (admin/training officer)
router.get('/center/insights', authenticate, isTrainingOfficer, async (req, res) => {
  // Set cache-control headers to ensure fresh data
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    // 1. ORGANIZATION SUMMARY
    const orgSummary = await db.query(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM users WHERE role = 'employee' AND is_active = true), 0) as total_employees,
        COALESCE((SELECT COUNT(*) FROM departments WHERE type = 'sector'), 0) as sectors_count,
        COALESCE((SELECT COUNT(*) FROM departments WHERE type = 'department'), 0) as departments_count,
        COALESCE((SELECT COUNT(*) FROM departments WHERE type = 'section'), 0) as sections_count,
        COALESCE((SELECT COUNT(*) FROM tests WHERE status = 'published'), 0) as active_tests,
        COALESCE((SELECT COUNT(*) FROM test_assignments), 0) as total_assignments,
        COALESCE((SELECT COUNT(*) FROM test_assignments WHERE status = 'completed'), 0) as completed_assignments,
        COALESCE((SELECT COUNT(*) FROM analysis_results), 0) as analyzed_count,
        COALESCE((SELECT ROUND(AVG(overall_score), 1) FROM analysis_results), 0) as organization_avg_score,
        COALESCE((SELECT COUNT(*) FROM training_recommendations WHERE status = 'recommended'), 0) as active_recommendations,
        COALESCE((SELECT COUNT(DISTINCT skill_id) FROM employee_skill_profiles WHERE current_level = 'low'), 0) as skills_with_gaps,
        COALESCE((SELECT COUNT(*) FROM training_domains WHERE is_active = true), 0) as total_domains,
        COALESCE((SELECT COUNT(*) FROM skills), 0) as total_skills
    `);

    // 2. DEPARTMENT ANALYTICS - Employee counts, avg scores, completion rates, skill performance
    const departmentAnalytics = await db.query(`
      SELECT 
        d.id,
        d.name_ar,
        d.name_en,
        d.type,
        d.parent_id,
        p.name_ar as parent_name_ar,
        COUNT(DISTINCT u.id) as employee_count,
        COUNT(DISTINCT ta.id) as total_assignments,
        COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END) as completed_assignments,
        ROUND(
          COUNT(DISTINCT CASE WHEN ta.status = 'completed' THEN ta.id END)::numeric / 
          NULLIF(COUNT(DISTINCT ta.id), 0) * 100, 1
        ) as completion_rate,
        ROUND(AVG(ar.overall_score), 1) as avg_score,
        COUNT(DISTINCT ar.id) as assessments_analyzed
      FROM departments d
      LEFT JOIN departments p ON d.parent_id = p.id
      LEFT JOIN users u ON u.department_id = d.id AND u.role = 'employee' AND u.is_active = true
      LEFT JOIN test_assignments ta ON ta.user_id = u.id
      LEFT JOIN analysis_results ar ON ar.user_id = u.id
      GROUP BY d.id, d.name_ar, d.name_en, d.type, d.parent_id, p.name_ar
      ORDER BY d.type, d.name_ar
    `);

    // 3. TOP PERFORMERS - Employees with highest average assessment scores
    const topPerformers = await db.query(`
      SELECT 
        u.id,
        u.name_ar,
        u.name_en,
        u.job_title_ar,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en,
        COUNT(ar.id) as assessments_count,
        ROUND(AVG(ar.overall_score), 1) as avg_score,
        MAX(ar.overall_score) as highest_score,
        MIN(ar.overall_score) as lowest_score,
        (
          SELECT ROUND(AVG(ar2.overall_score), 1)
          FROM analysis_results ar2
          WHERE ar2.user_id = u.id
          AND ar2.analyzed_at >= NOW() - INTERVAL '30 days'
        ) as recent_avg_score
      FROM users u
      JOIN analysis_results ar ON ar.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = true
      GROUP BY u.id, u.name_ar, u.name_en, u.job_title_ar, d.name_ar, d.name_en
      HAVING COUNT(ar.id) > 0
      ORDER BY avg_score DESC
      LIMIT 10
    `);

    // 4. BOTTOM PERFORMERS - Employees needing most development
    const bottomPerformers = await db.query(`
      SELECT 
        u.id,
        u.name_ar,
        u.name_en,
        u.job_title_ar,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en,
        COUNT(ar.id) as assessments_count,
        ROUND(AVG(ar.overall_score), 1) as avg_score,
        MAX(ar.overall_score) as highest_score,
        MIN(ar.overall_score) as lowest_score,
        (
          SELECT COUNT(*) FROM training_recommendations tr 
          WHERE tr.user_id = u.id AND tr.status = 'recommended'
        ) as pending_recommendations
      FROM users u
      JOIN analysis_results ar ON ar.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'employee' AND u.is_active = true
      GROUP BY u.id, u.name_ar, u.name_en, u.job_title_ar, d.name_ar, d.name_en
      HAVING COUNT(ar.id) > 0
      ORDER BY avg_score ASC
      LIMIT 10
    `);

    // 5. TOP SKILLS BY DEPARTMENT - Best performing skills per department
    const topSkillsByDepartment = await db.query(`
      WITH dept_skill_scores AS (
        SELECT 
          d.id as department_id,
          d.name_ar as department_name_ar,
          s.id as skill_id,
          s.name_ar as skill_name_ar,
          s.name_en as skill_name_en,
          td.name_ar as domain_name_ar,
          td.color as domain_color,
          ROUND(AVG(esp.last_assessment_score), 1) as avg_score,
          COUNT(esp.id) as assessed_count,
          ROW_NUMBER() OVER (
            PARTITION BY d.id 
            ORDER BY AVG(esp.last_assessment_score) DESC NULLS LAST
          ) as rank
        FROM departments d
        JOIN users u ON u.department_id = d.id AND u.role = 'employee' AND u.is_active = true
        JOIN employee_skill_profiles esp ON esp.user_id = u.id
        JOIN skills s ON s.id = esp.skill_id
        JOIN training_domains td ON s.domain_id = td.id
        WHERE esp.last_assessment_score IS NOT NULL
        GROUP BY d.id, d.name_ar, s.id, s.name_ar, s.name_en, td.name_ar, td.color
        HAVING COUNT(esp.id) >= 1
      )
      SELECT * FROM dept_skill_scores
      WHERE rank <= 3
      ORDER BY department_name_ar, rank
    `);

    // 6. WEAK SKILLS BY DEPARTMENT - Skills needing improvement per department
    const weakSkillsByDepartment = await db.query(`
      WITH dept_skill_scores AS (
        SELECT 
          d.id as department_id,
          d.name_ar as department_name_ar,
          s.id as skill_id,
          s.name_ar as skill_name_ar,
          s.name_en as skill_name_en,
          td.name_ar as domain_name_ar,
          td.color as domain_color,
          ROUND(AVG(esp.last_assessment_score), 1) as avg_score,
          COUNT(esp.id) as assessed_count,
          COUNT(CASE WHEN esp.current_level = 'low' THEN 1 END) as low_count,
          ROW_NUMBER() OVER (
            PARTITION BY d.id 
            ORDER BY AVG(esp.last_assessment_score) ASC NULLS LAST
          ) as rank
        FROM departments d
        JOIN users u ON u.department_id = d.id AND u.role = 'employee' AND u.is_active = true
        JOIN employee_skill_profiles esp ON esp.user_id = u.id
        JOIN skills s ON s.id = esp.skill_id
        JOIN training_domains td ON s.domain_id = td.id
        WHERE esp.last_assessment_score IS NOT NULL
        GROUP BY d.id, d.name_ar, s.id, s.name_ar, s.name_en, td.name_ar, td.color
        HAVING COUNT(esp.id) >= 1
      )
      SELECT * FROM dept_skill_scores
      WHERE rank <= 3
      ORDER BY department_name_ar, rank
    `);

    // 7. TRAINING NEEDS PRIORITY - Skills with most gaps across organization
    const trainingNeedsPriority = await db.query(`
      SELECT 
        s.id,
        s.name_ar,
        s.name_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color,
        COUNT(CASE WHEN esp.current_level = 'low' THEN 1 END) as low_count,
        COUNT(CASE WHEN esp.current_level = 'medium' THEN 1 END) as medium_count,
        COUNT(CASE WHEN esp.current_level = 'high' THEN 1 END) as high_count,
        COUNT(esp.id) as total_assessed,
        ROUND(AVG(esp.last_assessment_score), 1) as avg_score,
        ROUND(100 - AVG(esp.last_assessment_score), 1) as gap_percentage,
        (
          SELECT COUNT(*) FROM training_recommendations tr 
          WHERE tr.skill_id = s.id AND tr.status = 'recommended'
        ) as active_recommendations
      FROM skills s
      JOIN employee_skill_profiles esp ON s.id = esp.skill_id
      JOIN training_domains td ON s.domain_id = td.id
      GROUP BY s.id, s.name_ar, s.name_en, td.name_ar, td.name_en, td.color
      HAVING COUNT(esp.id) > 0
      ORDER BY avg_score ASC NULLS LAST
      LIMIT 15
    `);

    // 8. DEPARTMENTS WITH HIGHEST TRAINING NEEDS
    const departmentsTrainingNeeds = await db.query(`
      SELECT 
        d.id,
        d.name_ar,
        d.name_en,
        d.type,
        COUNT(DISTINCT u.id) as employee_count,
        COUNT(DISTINCT CASE WHEN esp.current_level = 'low' THEN esp.id END) as low_skill_count,
        COUNT(DISTINCT esp.id) as total_skill_assessments,
        ROUND(
          COUNT(DISTINCT CASE WHEN esp.current_level = 'low' THEN esp.id END)::numeric / 
          NULLIF(COUNT(DISTINCT esp.id), 0) * 100, 1
        ) as low_skill_percentage,
        ROUND(AVG(ar.overall_score), 1) as avg_assessment_score,
        COUNT(DISTINCT tr.id) as pending_recommendations
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.role = 'employee' AND u.is_active = true
      LEFT JOIN employee_skill_profiles esp ON esp.user_id = u.id
      LEFT JOIN analysis_results ar ON ar.user_id = u.id
      LEFT JOIN training_recommendations tr ON tr.user_id = u.id AND tr.status = 'recommended'
      GROUP BY d.id, d.name_ar, d.name_en, d.type
      HAVING COUNT(DISTINCT u.id) > 0
      ORDER BY low_skill_percentage DESC NULLS LAST, avg_assessment_score ASC NULLS LAST
      LIMIT 10
    `);

    // 9. RECENT ACTIVITY - Latest assessments with details and grading status
    const recentActivity = await db.query(`
      SELECT 
        ar.id,
        ar.overall_score,
        ar.analyzed_at,
        ar.assignment_id,
        u.name_ar as user_name_ar,
        u.name_en as user_name_en,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en,
        t.title_ar as test_title_ar,
        t.title_en as test_title_en,
        td.name_ar as domain_name_ar,
        td.color as domain_color
      FROM analysis_results ar
      JOIN users u ON ar.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ar.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      ORDER BY ar.analyzed_at DESC
      LIMIT 15
    `);

    // Calculate correct grades and grading status for recent activity
    // Uses same formula as test results for consistency
    const recentActivityWithGrades = await Promise.all(recentActivity.rows.map(async (activity) => {
      if (!activity.assignment_id) return activity;
      
      // Get open questions grading status
      const gradingStatus = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE q.question_type = 'open_text') as total_open_questions,
          COUNT(*) FILTER (WHERE q.question_type = 'open_text' AND r.score IS NULL) as ungraded_count
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [activity.assignment_id]);
      
      const status = gradingStatus.rows[0] || { total_open_questions: 0, ungraded_count: 0 };
      const needsGrading = parseInt(status.ungraded_count) > 0;
      
      // ALWAYS recalculate grade from responses for consistency
      const responsesData = await db.query(`
        SELECT r.score, q.question_type, q.options, q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [activity.assignment_id]);
      
      let totalScore = 0;
      let totalMaxScore = 0;
      
      for (const response of responsesData.rows) {
        let maxScore = 10;
        
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale' || response.question_type === 'self_rating') {
          maxScore = 10;
        } else if (response.question_type === 'open_text') {
          maxScore = 10;
        }
        
        const weight = parseFloat(response.weight) || 1;
        const score = parseFloat(response.score) || 0;
        
        totalScore += score * weight;
        totalMaxScore += maxScore * weight;
      }
      
      const calculatedGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
      
      return {
        ...activity,
        overall_score: calculatedGrade,
        needs_grading: needsGrading,
        ungraded_count: parseInt(status.ungraded_count),
        total_open_questions: parseInt(status.total_open_questions)
      };
    }));

    // 10. SCORE DISTRIBUTION - How employees are distributed across score ranges
    const scoreDistribution = await db.query(`
      WITH user_avg_scores AS (
        SELECT 
          u.id,
          ROUND(AVG(ar.overall_score), 0) as avg_score
        FROM users u
        JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.role = 'employee' AND u.is_active = true
        GROUP BY u.id
      ),
      categorized AS (
        SELECT 
          CASE 
            WHEN avg_score >= 90 THEN 'excellent'
            WHEN avg_score >= 70 THEN 'good'
            WHEN avg_score >= 50 THEN 'average'
            WHEN avg_score >= 30 THEN 'needs_improvement'
            ELSE 'critical'
          END as category,
          CASE 
            WHEN avg_score >= 90 THEN 1
            WHEN avg_score >= 70 THEN 2
            WHEN avg_score >= 50 THEN 3
            WHEN avg_score >= 30 THEN 4
            ELSE 5
          END as sort_order
        FROM user_avg_scores
      )
      SELECT category, COUNT(*) as count
      FROM categorized
      GROUP BY category, sort_order
      ORDER BY sort_order
    `);

    // 11. ASSESSMENT TRENDS - Monthly assessment counts and averages
    const assessmentTrends = await db.query(`
      SELECT 
        TO_CHAR(analyzed_at, 'YYYY-MM') as month,
        COUNT(*) as assessments_count,
        ROUND(AVG(overall_score), 1) as avg_score
      FROM analysis_results
      WHERE analyzed_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(analyzed_at, 'YYYY-MM')
      ORDER BY month
    `);

    // Group top and weak skills by department for easier frontend consumption
    const skillsByDepartment = {};
    
    topSkillsByDepartment.rows.forEach(row => {
      if (!skillsByDepartment[row.department_id]) {
        skillsByDepartment[row.department_id] = {
          department_id: row.department_id,
          department_name_ar: row.department_name_ar,
          top_skills: [],
          weak_skills: []
        };
      }
      skillsByDepartment[row.department_id].top_skills.push({
        skill_id: row.skill_id,
        skill_name_ar: row.skill_name_ar,
        skill_name_en: row.skill_name_en,
        domain_name_ar: row.domain_name_ar,
        domain_color: row.domain_color,
        avg_score: row.avg_score,
        assessed_count: row.assessed_count
      });
    });

    weakSkillsByDepartment.rows.forEach(row => {
      if (!skillsByDepartment[row.department_id]) {
        skillsByDepartment[row.department_id] = {
          department_id: row.department_id,
          department_name_ar: row.department_name_ar,
          top_skills: [],
          weak_skills: []
        };
      }
      skillsByDepartment[row.department_id].weak_skills.push({
        skill_id: row.skill_id,
        skill_name_ar: row.skill_name_ar,
        skill_name_en: row.skill_name_en,
        domain_name_ar: row.domain_name_ar,
        domain_color: row.domain_color,
        avg_score: row.avg_score,
        assessed_count: row.assessed_count,
        low_count: row.low_count
      });
    });

    res.json({
      organization_summary: orgSummary.rows[0],
      department_analytics: departmentAnalytics.rows,
      top_performers: topPerformers.rows,
      bottom_performers: bottomPerformers.rows,
      skills_by_department: Object.values(skillsByDepartment),
      training_needs_priority: trainingNeedsPriority.rows,
      departments_training_needs: departmentsTrainingNeeds.rows,
      recent_activity: recentActivityWithGrades,
      score_distribution: scoreDistribution.rows,
      assessment_trends: assessmentTrends.rows
    });
  } catch (error) {
    console.error('Get center insights error:', error);
    res.status(500).json({ error: 'Failed to get insights data' });
  }
});

// Get employee leaderboard with full rankings and achievements
router.get('/employee/leaderboard', authenticate, async (req, res) => {
  // Set cache-control headers to ensure fresh data
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    const userId = req.user.id;
    
    // Get user's department
    const userInfo = await db.query(`
      SELECT 
        u.id,
        u.department_id,
        u.name_ar,
        u.name_en,
        d.name_ar as department_name_ar,
        d.name_en as department_name_en
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `, [userId]);

    if (userInfo.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userInfo.rows[0];
    const departmentId = user.department_id;

    // 1. DEPARTMENT LEADERBOARD - Top performers in department
    const departmentLeaderboard = await db.query(`
      WITH dept_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          u.name_en,
          u.job_title_ar,
          u.avatar_url,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count,
          MAX(ar.analyzed_at) as last_assessment
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.department_id = $1 
          AND u.role = 'employee' 
          AND u.is_active = true
        GROUP BY u.id, u.name_ar, u.name_en, u.job_title_ar, u.avatar_url
        HAVING COUNT(ar.id) > 0
      )
      SELECT 
        *,
        ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as rank,
        COUNT(*) OVER () as total_in_dept
      FROM dept_scores
      ORDER BY rank
      LIMIT 15
    `, [departmentId]);

    // Get current user's position in department
    const userDeptPosition = await db.query(`
      WITH dept_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.department_id = $1 
          AND u.role = 'employee' 
          AND u.is_active = true
        GROUP BY u.id, u.name_ar
        HAVING COUNT(ar.id) > 0
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as rank,
          COUNT(*) OVER () as total
        FROM dept_scores
      )
      SELECT * FROM ranked WHERE user_id = $2
    `, [departmentId, userId]);

    // 2. ORGANIZATION LEADERBOARD - Top performers across all departments
    const organizationLeaderboard = await db.query(`
      WITH org_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          u.name_en,
          u.job_title_ar,
          u.avatar_url,
          d.name_ar as department_name_ar,
          d.name_en as department_name_en,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count,
          MAX(ar.analyzed_at) as last_assessment
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE u.role = 'employee' AND u.is_active = true
        GROUP BY u.id, u.name_ar, u.name_en, u.job_title_ar, u.avatar_url, d.name_ar, d.name_en
        HAVING COUNT(ar.id) > 0
      )
      SELECT 
        *,
        ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as rank,
        COUNT(*) OVER () as total_employees
      FROM org_scores
      ORDER BY rank
      LIMIT 15
    `);

    // Get current user's position in organization
    const userOrgPosition = await db.query(`
      WITH org_scores AS (
        SELECT 
          u.id as user_id,
          ROUND(AVG(ar.overall_score), 1) as avg_score,
          COUNT(ar.id) as assessment_count
        FROM users u
        LEFT JOIN analysis_results ar ON ar.user_id = u.id
        WHERE u.role = 'employee' AND u.is_active = true
        GROUP BY u.id
        HAVING COUNT(ar.id) > 0
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC, assessment_count DESC) as rank,
          COUNT(*) OVER () as total
        FROM org_scores
      )
      SELECT * FROM ranked WHERE user_id = $1
    `, [userId]);

    // 3. DOMAIN LEADERBOARD - Top performers per domain
    const domainLeaderboards = await db.query(`
      WITH domain_scores AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          td.id as domain_id,
          td.name_ar as domain_name_ar,
          td.name_en as domain_name_en,
          td.color as domain_color,
          ROUND(AVG(esp.last_assessment_score), 1) as avg_score,
          COUNT(DISTINCT esp.skill_id) as skills_assessed
        FROM users u
        INNER JOIN employee_skill_profiles esp ON esp.user_id = u.id
        INNER JOIN skills s ON s.id = esp.skill_id
        INNER JOIN training_domains td ON s.domain_id = td.id
        WHERE u.role = 'employee' 
          AND u.is_active = true
          AND esp.last_assessment_score IS NOT NULL
        GROUP BY u.id, u.name_ar, td.id, td.name_ar, td.name_en, td.color
      ),
      domain_ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY domain_id ORDER BY avg_score DESC, skills_assessed DESC) as domain_rank,
          COUNT(*) OVER (PARTITION BY domain_id) as total_in_domain
        FROM domain_scores
      )
      SELECT * FROM domain_ranked
      WHERE domain_rank <= 5
      ORDER BY domain_name_ar, domain_rank
    `);

    // 4. USER ACHIEVEMENTS & STATS
    // Calculate user achievements
    const userStats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM analysis_results WHERE user_id = $1) as total_assessments,
        (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'completed') as completed_assignments,
        (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1) as total_assignments,
        (SELECT ROUND(AVG(overall_score), 1) FROM analysis_results WHERE user_id = $1) as avg_score,
        (SELECT MAX(overall_score) FROM analysis_results WHERE user_id = $1) as highest_score,
        (SELECT MIN(overall_score) FROM analysis_results WHERE user_id = $1) as lowest_score,
        (SELECT COUNT(DISTINCT skill_id) FROM employee_skill_profiles WHERE user_id = $1 AND current_level = 'high') as high_level_skills,
        (SELECT COUNT(*) FROM training_recommendations WHERE user_id = $1 AND status = 'completed') as completed_trainings
    `, [userId]);

    // Get score history for trend
    const scoreHistory = await db.query(`
      SELECT 
        TO_CHAR(analyzed_at, 'YYYY-MM') as month,
        ROUND(AVG(overall_score), 1) as avg_score,
        COUNT(*) as assessment_count
      FROM analysis_results
      WHERE user_id = $1
        AND analyzed_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(analyzed_at, 'YYYY-MM')
      ORDER BY month
    `, [userId]);

    // Calculate improvement trend
    const improvementTrend = await db.query(`
      WITH monthly_scores AS (
        SELECT 
          TO_CHAR(analyzed_at, 'YYYY-MM') as month,
          ROUND(AVG(overall_score), 1) as avg_score
        FROM analysis_results
        WHERE user_id = $1
          AND analyzed_at >= NOW() - INTERVAL '3 months'
        GROUP BY TO_CHAR(analyzed_at, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 2
      )
      SELECT 
        COALESCE(
          (SELECT avg_score FROM monthly_scores ORDER BY month DESC LIMIT 1) -
          (SELECT avg_score FROM monthly_scores ORDER BY month DESC OFFSET 1 LIMIT 1),
          0
        ) as score_change
    `, [userId]);

    // Calculate streak (consecutive completed assessments)
    const streakData = await db.query(`
      WITH ordered_assignments AS (
        SELECT 
          id,
          completed_at,
          status,
          LAG(completed_at) OVER (ORDER BY completed_at) as prev_completed
        FROM test_assignments
        WHERE user_id = $1 AND status = 'completed'
        ORDER BY completed_at DESC
      )
      SELECT COUNT(*) as current_streak
      FROM ordered_assignments
      WHERE completed_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    // Build achievements array
    const stats = userStats.rows[0] || {};
    const userPosition = userOrgPosition.rows[0];
    const achievements = [];

    // Rank-based badges (Updated thresholds: Top 5%, 10%, 20%)
    if (userPosition) {
      const percentile = ((userPosition.total - userPosition.rank + 1) / userPosition.total) * 100;
      if (percentile >= 95) {
        achievements.push({ id: 'top_5', title_ar: 'نخبة المنظمة', title_en: 'Top 5%', icon: 'trophy', color: 'gold' });
      } else if (percentile >= 90) {
        achievements.push({ id: 'top_10', title_ar: 'متفوق', title_en: 'Top 10%', icon: 'medal', color: 'silver' });
      } else if (percentile >= 80) {
        achievements.push({ id: 'top_20', title_ar: 'فوق المتوسط', title_en: 'Top 20%', icon: 'star', color: 'bronze' });
      }
    }

    // Assessment milestones (Updated: 20+ and 10+ assessments)
    if (stats.total_assessments >= 20) {
      achievements.push({ id: 'assessments_20', title_ar: 'مقيّم متمرس', title_en: '20 Assessments', icon: 'clipboard', color: 'purple' });
    } else if (stats.total_assessments >= 10) {
      achievements.push({ id: 'assessments_10', title_ar: 'في الطريق', title_en: '10 Assessments', icon: 'clipboard', color: 'blue' });
    }

    // High score badge (Updated: 95% threshold)
    if (stats.highest_score >= 95) {
      achievements.push({ id: 'high_score', title_ar: 'متميز', title_en: 'Excellent Score', icon: 'fire', color: 'red' });
    }

    // Skill mastery (Updated: 30+ high-level skills)
    if (stats.high_level_skills >= 30) {
      achievements.push({ id: 'skill_master', title_ar: 'سيد المهارات', title_en: 'Skill Master', icon: 'academic', color: 'green' });
    }

    // Improvement badge (Updated: 20% improvement threshold)
    const scoreChange = improvementTrend.rows[0]?.score_change || 0;
    if (scoreChange >= 20) {
      achievements.push({ id: 'rising_star', title_ar: 'نجم صاعد', title_en: 'Rising Star', icon: 'trending-up', color: 'orange' });
    }

    // Monthly course completions badges
    // Query for courses completed in the current month
    const monthlyCoursesResult = await db.query(`
      SELECT COUNT(*) as monthly_courses
      FROM course_completion_certificates
      WHERE user_id = $1
        AND completed_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND completed_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    `, [userId]);
    
    const monthlyCourses = parseInt(monthlyCoursesResult.rows[0]?.monthly_courses || 0);
    
    // Distinguished learner badge (4+ courses in one month)
    if (monthlyCourses >= 4) {
      achievements.push({ id: 'distinguished_learner', title_ar: 'متعلم متميز', title_en: 'Distinguished Learner', icon: 'spark', color: 'purple' });
    }
    // Active learner badge (2+ courses in one month)
    if (monthlyCourses >= 2) {
      achievements.push({ id: 'active_learner', title_ar: 'متعلم نشط', title_en: 'Active Learner', icon: 'book', color: 'teal' });
    }

    // Group domain leaderboards
    const domainLeaderboardsGrouped = {};
    domainLeaderboards.rows.forEach(row => {
      if (!domainLeaderboardsGrouped[row.domain_id]) {
        domainLeaderboardsGrouped[row.domain_id] = {
          domain_id: row.domain_id,
          domain_name_ar: row.domain_name_ar,
          domain_name_en: row.domain_name_en,
          domain_color: row.domain_color,
          leaders: []
        };
      }
      domainLeaderboardsGrouped[row.domain_id].leaders.push({
        user_id: row.user_id,
        name_ar: row.name_ar,
        avg_score: row.avg_score,
        skills_assessed: row.skills_assessed,
        rank: row.domain_rank,
        is_current_user: row.user_id === userId
      });
    });

    res.json({
      user_info: {
        id: user.id,
        name_ar: user.name_ar,
        name_en: user.name_en,
        department_name_ar: user.department_name_ar,
        department_name_en: user.department_name_en
      },
      department_leaderboard: {
        leaders: departmentLeaderboard.rows.map(r => ({
          ...r,
          is_current_user: r.user_id === userId
        })),
        user_position: userDeptPosition.rows[0] || null,
        total_in_dept: departmentLeaderboard.rows[0]?.total_in_dept || 0
      },
      organization_leaderboard: {
        leaders: organizationLeaderboard.rows.map(r => ({
          ...r,
          is_current_user: r.user_id === userId
        })),
        user_position: userOrgPosition.rows[0] || null,
        total_employees: organizationLeaderboard.rows[0]?.total_employees || 0
      },
      domain_leaderboards: Object.values(domainLeaderboardsGrouped),
      achievements,
      user_stats: {
        ...stats,
        score_change: scoreChange,
        current_streak: streakData.rows[0]?.current_streak || 0,
        percentile: userPosition 
          ? Math.round(((userPosition.total - userPosition.rank + 1) / userPosition.total) * 100)
          : null
      },
      score_history: scoreHistory.rows
    });
  } catch (error) {
    console.error('Get employee leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard data' });
  }
});

// Badge definitions - for admin/training officer to understand badge criteria
router.get('/badges/definitions', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const badgeDefinitions = [
      {
        id: 'top_5',
        title_ar: 'نخبة المنظمة',
        title_en: 'Top 5%',
        description_ar: 'ترتيب ضمن أفضل 5% من الموظفين',
        description_en: 'Ranked in the top 5% of employees',
        criteria_ar: 'يتم حسابه بناءً على متوسط نتائج التقييمات مقارنة بجميع الموظفين',
        criteria_en: 'Calculated based on average assessment scores compared to all employees',
        icon: 'trophy',
        color: 'gold',
        category: 'ranking'
      },
      {
        id: 'top_10',
        title_ar: 'متفوق',
        title_en: 'Top 10%',
        description_ar: 'ترتيب ضمن أفضل 10% من الموظفين',
        description_en: 'Ranked in the top 10% of employees',
        criteria_ar: 'يتم حسابه بناءً على متوسط نتائج التقييمات مقارنة بجميع الموظفين',
        criteria_en: 'Calculated based on average assessment scores compared to all employees',
        icon: 'medal',
        color: 'silver',
        category: 'ranking'
      },
      {
        id: 'top_20',
        title_ar: 'فوق المتوسط',
        title_en: 'Top 20%',
        description_ar: 'ترتيب ضمن أفضل 20% من الموظفين',
        description_en: 'Ranked in the top 20% of employees',
        criteria_ar: 'يتم حسابه بناءً على متوسط نتائج التقييمات مقارنة بجميع الموظفين',
        criteria_en: 'Calculated based on average assessment scores compared to all employees',
        icon: 'star',
        color: 'bronze',
        category: 'ranking'
      },
      {
        id: 'assessments_20',
        title_ar: 'مقيّم متمرس',
        title_en: '20 Assessments',
        description_ar: 'إكمال 20 تقييم أو أكثر',
        description_en: 'Completed 20 or more assessments',
        criteria_ar: 'يُمنح عند إكمال 20 تقييم على الأقل',
        criteria_en: 'Awarded after completing at least 20 assessments',
        icon: 'clipboard',
        color: 'purple',
        category: 'milestone'
      },
      {
        id: 'assessments_10',
        title_ar: 'في الطريق',
        title_en: '10 Assessments',
        description_ar: 'إكمال 10 تقييمات',
        description_en: 'Completed 10 assessments',
        criteria_ar: 'يُمنح عند إكمال 10 تقييمات على الأقل',
        criteria_en: 'Awarded after completing at least 10 assessments',
        icon: 'clipboard',
        color: 'blue',
        category: 'milestone'
      },
      {
        id: 'high_score',
        title_ar: 'متميز',
        title_en: 'Excellent Score',
        description_ar: 'الحصول على درجة 95% أو أعلى',
        description_en: 'Achieved a score of 95% or higher',
        criteria_ar: 'يُمنح عند الحصول على درجة 95% أو أكثر في أي تقييم',
        criteria_en: 'Awarded for achieving 95% or higher on any assessment',
        icon: 'fire',
        color: 'red',
        category: 'performance'
      },
      {
        id: 'skill_master',
        title_ar: 'سيد المهارات',
        title_en: 'Skill Master',
        description_ar: '30 مهارة أو أكثر بمستوى عالي',
        description_en: '30 or more skills at high level',
        criteria_ar: 'يُمنح عند الوصول إلى 30 مهارة بمستوى عالي في ملف المهارات',
        criteria_en: 'Awarded when 30 skills reach high level in skill profile',
        icon: 'academic',
        color: 'green',
        category: 'skills'
      },
      {
        id: 'rising_star',
        title_ar: 'نجم صاعد',
        title_en: 'Rising Star',
        description_ar: 'تحسن 20% أو أكثر بين الشهرين الأخيرين',
        description_en: '20% or more improvement between last two months',
        criteria_ar: 'يُمنح عند تحقيق تحسن 20% أو أكثر في متوسط الدرجات بين الشهرين الأخيرين',
        criteria_en: 'Awarded for 20% or more improvement in average score between last two months',
        icon: 'trending-up',
        color: 'orange',
        category: 'improvement'
      },
      {
        id: 'active_learner',
        title_ar: 'متعلم نشط',
        title_en: 'Active Learner',
        description_ar: 'إكمال كورسين أو أكثر في شهر واحد',
        description_en: 'Completed 2 or more courses in one month',
        criteria_ar: 'يُمنح عند إكمال كورسين على الأقل خلال الشهر الحالي',
        criteria_en: 'Awarded for completing at least 2 courses in the current month',
        icon: 'book',
        color: 'teal',
        category: 'learning'
      },
      {
        id: 'distinguished_learner',
        title_ar: 'متعلم متميز',
        title_en: 'Distinguished Learner',
        description_ar: 'إكمال 4 كورسات أو أكثر في شهر واحد',
        description_en: 'Completed 4 or more courses in one month',
        criteria_ar: 'يُمنح عند إكمال 4 كورسات على الأقل خلال الشهر الحالي',
        criteria_en: 'Awarded for completing at least 4 courses in the current month',
        icon: 'spark',
        color: 'purple',
        category: 'learning'
      }
    ];

    // Group by category
    const categories = {
      ranking: { title_ar: 'أوسمة الترتيب', title_en: 'Ranking Badges', badges: [] },
      milestone: { title_ar: 'أوسمة الإنجازات', title_en: 'Milestone Badges', badges: [] },
      performance: { title_ar: 'أوسمة الأداء', title_en: 'Performance Badges', badges: [] },
      skills: { title_ar: 'أوسمة المهارات', title_en: 'Skills Badges', badges: [] },
      improvement: { title_ar: 'أوسمة التطور', title_en: 'Improvement Badges', badges: [] },
      learning: { title_ar: 'أوسمة التعلم', title_en: 'Learning Badges', badges: [] }
    };

    badgeDefinitions.forEach(badge => {
      if (categories[badge.category]) {
        categories[badge.category].badges.push(badge);
      }
    });

    res.json({
      badges: badgeDefinitions,
      categories: Object.entries(categories).map(([key, value]) => ({
        id: key,
        ...value
      }))
    });
  } catch (error) {
    console.error('Get badge definitions error:', error);
    res.status(500).json({ error: 'Failed to get badge definitions' });
  }
});

// Get all employees with their badges - for admin dashboard
router.get('/badges/employees', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get all employees with their stats for badge calculation
    const employeesData = await db.query(`
      WITH employee_stats AS (
        SELECT 
          u.id as user_id,
          u.name_ar,
          u.name_en,
          u.job_title_ar,
          u.avatar_url,
          d.name_ar as department_name_ar,
          d.name_en as department_name_en,
          COALESCE((SELECT COUNT(*) FROM analysis_results WHERE user_id = u.id), 0) as total_assessments,
          COALESCE((SELECT MAX(overall_score) FROM analysis_results WHERE user_id = u.id), 0) as highest_score,
          COALESCE((SELECT COUNT(DISTINCT skill_id) FROM employee_skill_profiles WHERE user_id = u.id AND current_level = 'high'), 0) as high_level_skills,
          COALESCE((SELECT ROUND(AVG(overall_score), 1) FROM analysis_results WHERE user_id = u.id), 0) as avg_score
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE u.role = 'employee' AND u.is_active = true
      ),
      org_ranking AS (
        SELECT 
          user_id,
          avg_score,
          ROW_NUMBER() OVER (ORDER BY avg_score DESC) as rank,
          COUNT(*) OVER () as total
        FROM employee_stats
        WHERE total_assessments > 0
      )
      SELECT 
        es.*,
        or_rank.rank,
        or_rank.total,
        CASE 
          WHEN or_rank.total > 0 THEN ((or_rank.total - or_rank.rank + 1)::numeric / or_rank.total * 100)
          ELSE 0 
        END as percentile
      FROM employee_stats es
      LEFT JOIN org_ranking or_rank ON es.user_id = or_rank.user_id
      ORDER BY es.avg_score DESC NULLS LAST
    `);

    // Get improvement trends for all users
    const improvementTrends = await db.query(`
      WITH monthly_scores AS (
        SELECT 
          user_id,
          TO_CHAR(analyzed_at, 'YYYY-MM') as month,
          ROUND(AVG(overall_score), 1) as avg_score
        FROM analysis_results
        WHERE analyzed_at >= NOW() - INTERVAL '3 months'
        GROUP BY user_id, TO_CHAR(analyzed_at, 'YYYY-MM')
      ),
      ranked_months AS (
        SELECT 
          user_id,
          month,
          avg_score,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY month DESC) as month_rank
        FROM monthly_scores
      )
      SELECT 
        r1.user_id,
        COALESCE(r1.avg_score - r2.avg_score, 0) as score_change
      FROM ranked_months r1
      LEFT JOIN ranked_months r2 ON r1.user_id = r2.user_id AND r2.month_rank = 2
      WHERE r1.month_rank = 1
    `);

    const improvementMap = {};
    improvementTrends.rows.forEach(row => {
      improvementMap[row.user_id] = parseFloat(row.score_change) || 0;
    });

    // Get monthly course completions for all users
    const monthlyCoursesData = await db.query(`
      SELECT 
        user_id,
        COUNT(*) as monthly_courses
      FROM course_completion_certificates
      WHERE completed_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND completed_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      GROUP BY user_id
    `);

    const monthlyCoursesMap = {};
    monthlyCoursesData.rows.forEach(row => {
      monthlyCoursesMap[row.user_id] = parseInt(row.monthly_courses) || 0;
    });

    // Calculate badges for each employee
    const employeesWithBadges = [];
    const badgeSummary = {};

    for (const emp of employeesData.rows) {
      const badges = [];
      const percentile = parseFloat(emp.percentile) || 0;
      const scoreChange = improvementMap[emp.user_id] || 0;
      const monthlyCourses = monthlyCoursesMap[emp.user_id] || 0;

      // Ranking badges
      if (percentile >= 95) {
        badges.push({ id: 'top_5', title_ar: 'نخبة المنظمة', title_en: 'Top 5%', icon: 'trophy', color: 'gold' });
      } else if (percentile >= 90) {
        badges.push({ id: 'top_10', title_ar: 'متفوق', title_en: 'Top 10%', icon: 'medal', color: 'silver' });
      } else if (percentile >= 80) {
        badges.push({ id: 'top_20', title_ar: 'فوق المتوسط', title_en: 'Top 20%', icon: 'star', color: 'bronze' });
      }

      // Assessment milestones
      if (emp.total_assessments >= 20) {
        badges.push({ id: 'assessments_20', title_ar: 'مقيّم متمرس', title_en: '20 Assessments', icon: 'clipboard', color: 'purple' });
      } else if (emp.total_assessments >= 10) {
        badges.push({ id: 'assessments_10', title_ar: 'في الطريق', title_en: '10 Assessments', icon: 'clipboard', color: 'blue' });
      }

      // High score
      if (emp.highest_score >= 95) {
        badges.push({ id: 'high_score', title_ar: 'متميز', title_en: 'Excellent Score', icon: 'fire', color: 'red' });
      }

      // Skill mastery
      if (emp.high_level_skills >= 30) {
        badges.push({ id: 'skill_master', title_ar: 'سيد المهارات', title_en: 'Skill Master', icon: 'academic', color: 'green' });
      }

      // Improvement
      if (scoreChange >= 20) {
        badges.push({ id: 'rising_star', title_ar: 'نجم صاعد', title_en: 'Rising Star', icon: 'trending-up', color: 'orange' });
      }

      // Monthly course completions
      if (monthlyCourses >= 4) {
        badges.push({ id: 'distinguished_learner', title_ar: 'متعلم متميز', title_en: 'Distinguished Learner', icon: 'spark', color: 'purple' });
      }
      if (monthlyCourses >= 2) {
        badges.push({ id: 'active_learner', title_ar: 'متعلم نشط', title_en: 'Active Learner', icon: 'book', color: 'teal' });
      }

      // Update badge summary
      badges.forEach(badge => {
        badgeSummary[badge.id] = (badgeSummary[badge.id] || 0) + 1;
      });

      if (badges.length > 0) {
        employeesWithBadges.push({
          user_id: emp.user_id,
          name_ar: emp.name_ar,
          name_en: emp.name_en,
          job_title_ar: emp.job_title_ar,
          avatar_url: emp.avatar_url,
          department_name_ar: emp.department_name_ar,
          department_name_en: emp.department_name_en,
          avg_score: emp.avg_score,
          badges,
          badge_count: badges.length
        });
      }
    }

    // Sort by badge count descending
    employeesWithBadges.sort((a, b) => b.badge_count - a.badge_count);

    res.json({
      employees_with_badges: employeesWithBadges,
      badge_summary: badgeSummary,
      total_employees_with_badges: employeesWithBadges.length,
      total_employees: employeesData.rows.length
    });
  } catch (error) {
    console.error('Get employees badges error:', error);
    res.status(500).json({ error: 'Failed to get employees badges' });
  }
});

module.exports = router;

