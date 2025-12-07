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
        ta.completed_at
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
    
    res.json(result.rows);
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

module.exports = router;
