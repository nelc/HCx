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
        (SELECT COUNT(*) FROM users WHERE role = 'employee' AND is_active = true) as total_employees,
        (SELECT COUNT(*) FROM tests WHERE status = 'published') as active_tests,
        (SELECT COUNT(*) FROM test_assignments) as total_assignments,
        (SELECT COUNT(*) FROM test_assignments WHERE status = 'completed') as completed_assignments,
        (SELECT COUNT(*) FROM analysis_results) as analyzed_count,
        (SELECT COUNT(*) FROM training_recommendations) as total_recommendations
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
  try {
    const userId = req.user.id;
    
    // My statistics
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1) as total_assignments,
        (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'completed') as completed_count,
        (SELECT COUNT(*) FROM test_assignments WHERE user_id = $1 AND status = 'pending') as pending_count,
        (SELECT ROUND(AVG(overall_score), 1) FROM analysis_results WHERE user_id = $1) as avg_score,
        (SELECT COUNT(*) FROM training_recommendations WHERE user_id = $1) as total_recommendations,
        (SELECT COUNT(*) FROM training_recommendations WHERE user_id = $1 AND status = 'completed') as completed_recommendations
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
    
    // My skill profile
    const skillProfile = await db.query(`
      SELECT 
        esp.*,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        td.color as domain_color
      FROM employee_skill_profiles esp
      JOIN skills s ON esp.skill_id = s.id
      JOIN training_domains td ON s.domain_id = td.id
      WHERE esp.user_id = $1
      ORDER BY esp.last_assessment_score ASC
    `, [userId]);
    
    // Recent results
    const recentResults = await db.query(`
      SELECT 
        ar.id,
        ar.overall_score,
        ar.analyzed_at,
        ar.strengths,
        ar.gaps,
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
    
    res.json({
      stats: stats.rows[0],
      pending_assignments: pendingAssignments.rows,
      skill_profile: skillProfile.rows,
      recent_results: recentResults.rows,
      recommendations: recommendations.rows
    });
  } catch (error) {
    console.error('Get employee dashboard error:', error);
    res.status(500).json({ error: 'Failed to get employee dashboard' });
  }
});

// Get quick stats for header
router.get('/quick-stats', authenticate, async (req, res) => {
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

module.exports = router;

