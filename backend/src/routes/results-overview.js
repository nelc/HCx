const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all results with filters (admin and training_officer only)
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { department_id, test_id, search } = req.query;
    
    let query = `
      SELECT 
        ta.id as assignment_id,
        u.id as user_id,
        u.name_ar as employee_name,
        u.employee_number,
        d.name_ar as department_name,
        d.id as department_id,
        t.id as test_id,
        t.title_ar as test_name,
        ar.overall_score as grade,
        ar.id as analysis_id,
        ar.analyzed_at,
        ta.completed_at,
        -- Check for open_text questions needing grading
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
          AND r.score IS NULL
        ) as ungraded_open_questions,
        -- Get total open_text questions
        (
          SELECT COUNT(*) FROM responses r
          JOIN questions q ON r.question_id = q.id
          WHERE r.assignment_id = ta.id
          AND q.question_type = 'open_text'
        ) as total_open_questions
      FROM test_assignments ta
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN analysis_results ar ON ta.id = ar.assignment_id
      WHERE ta.status = 'completed'
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Filter by department
    if (department_id) {
      query += ` AND u.department_id = $${paramCount}`;
      params.push(department_id);
      paramCount++;
    }
    
    // Filter by test
    if (test_id) {
      query += ` AND t.id = $${paramCount}`;
      params.push(test_id);
      paramCount++;
    }
    
    // Search by employee name
    if (search) {
      query += ` AND (u.name_ar ILIKE $${paramCount} OR u.name_en ILIKE $${paramCount} OR u.employee_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY ta.completed_at DESC';
    
    const result = await db.query(query, params);
    
    // Calculate actual grade based on weighted responses
    const resultsWithCorrectGrade = await Promise.all(result.rows.map(async (row) => {
      // Get weighted score breakdown
      const responsesData = await db.query(`
        SELECT 
          r.score,
          q.question_type,
          q.options,
          q.weight
        FROM responses r
        JOIN questions q ON r.question_id = q.id
        WHERE r.assignment_id = $1
      `, [row.assignment_id]);
      
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
        ...row,
        grade: calculatedGrade,
        needs_grading: parseInt(row.ungraded_open_questions) > 0,
        ungraded_count: parseInt(row.ungraded_open_questions),
        total_open_questions: parseInt(row.total_open_questions)
      };
    }));
    
    res.json(resultsWithCorrectGrade);
  } catch (error) {
    console.error('Get results overview error:', error);
    res.status(500).json({ error: 'Failed to get results overview' });
  }
});

// Get filter options (departments and tests)
router.get('/filters', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Get all departments
    const departments = await db.query(`
      SELECT DISTINCT d.id, d.name_ar
      FROM departments d
      JOIN users u ON d.id = u.department_id
      JOIN test_assignments ta ON u.id = ta.user_id
      WHERE ta.status = 'completed'
      ORDER BY d.name_ar
    `);
    
    // Get all tests that have completed assignments
    const tests = await db.query(`
      SELECT DISTINCT t.id, t.title_ar
      FROM tests t
      JOIN test_assignments ta ON t.id = ta.test_id
      WHERE ta.status = 'completed'
      ORDER BY t.title_ar
    `);
    
    res.json({
      departments: departments.rows,
      tests: tests.rows
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ error: 'Failed to get filter options' });
  }
});

// Recalculate grade for an assignment after grading open questions
router.post('/recalculate/:assignmentId', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    // Verify assignment exists
    const assignment = await db.query(
      'SELECT id FROM test_assignments WHERE id = $1 AND status = $2',
      [assignmentId, 'completed']
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Completed assignment not found' });
    }
    
    // Get weighted score breakdown
    const responsesData = await db.query(`
      SELECT 
        r.score,
        q.question_type,
        q.options,
        q.weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
    `, [assignmentId]);
    
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
    
    const newGrade = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
    
    // Update analysis_results with new grade
    await db.query(`
      UPDATE analysis_results 
      SET overall_score = $1, updated_at = NOW()
      WHERE assignment_id = $2
    `, [newGrade, assignmentId]);
    
    res.json({ 
      message: 'Grade recalculated successfully',
      new_grade: newGrade,
      total_score: Math.round(totalScore * 10) / 10,
      max_score: Math.round(totalMaxScore * 10) / 10
    });
  } catch (error) {
    console.error('Recalculate grade error:', error);
    res.status(500).json({ error: 'Failed to recalculate grade' });
  }
});

module.exports = router;
