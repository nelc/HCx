const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isTrainingOfficer, isEmployee } = require('../middleware/auth');
const { sendTestAssignedEmail } = require('../services/emailService');

const router = express.Router();

// Get all assignments (for training officer)
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { test_id, status, department_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ta.*,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             u.email as user_email,
             u.employee_number,
             d.name_ar as department_name_ar,
             d.name_en as department_name_en,
             ab.name_ar as assigned_by_name_ar,
             ab.name_en as assigned_by_name_en
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      JOIN users u ON ta.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users ab ON ta.assigned_by = ab.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (test_id) {
      paramCount++;
      query += ` AND ta.test_id = $${paramCount}`;
      params.push(test_id);
    }
    
    if (status) {
      paramCount++;
      query += ` AND ta.status = $${paramCount}`;
      params.push(status);
    }
    
    if (department_id) {
      paramCount++;
      query += ` AND u.department_id = $${paramCount}`;
      params.push(department_id);
    }
    
    query += ` ORDER BY ta.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json({
      assignments: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

// Get my assignments (for employee)
router.get('/my', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT ta.*,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             t.description_ar as test_description_ar,
             t.description_en as test_description_en,
             t.duration_minutes,
             t.is_timed,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             td.icon as domain_icon,
             (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as questions_count
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      WHERE ta.user_id = $1 AND t.status = 'published'
    `;
    const params = [req.user.id];
    
    if (status) {
      query += ' AND ta.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY ta.due_date ASC, ta.created_at DESC';
    
    const result = await db.query(query, params);
    
    // Fetch target skills for each test
    const assignments = await Promise.all(
      result.rows.map(async (assignment) => {
        const skillsResult = await db.query(`
          SELECT s.id, s.name_ar, s.name_en
          FROM test_skills ts
          JOIN skills s ON ts.skill_id = s.id
          WHERE ts.test_id = $1
          ORDER BY s.name_ar
        `, [assignment.test_id]);
        
        return {
          ...assignment,
          target_skills: skillsResult.rows
        };
      })
    );
    
    res.json(assignments);
  } catch (error) {
    console.error('Get my assignments error:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

// Get single assignment
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ta.*,
             t.title_ar as test_title_ar,
             t.title_en as test_title_en,
             t.description_ar as test_description_ar,
             t.description_en as test_description_en,
             t.instructions_ar,
             t.instructions_en,
             t.duration_minutes,
             t.is_timed,
             t.is_randomized,
             t.show_results_immediately,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en
      FROM test_assignments ta
      JOIN tests t ON ta.test_id = t.id
      LEFT JOIN training_domains td ON t.domain_id = td.id
      JOIN users u ON ta.user_id = u.id
      WHERE ta.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check authorization
    const assignment = result.rows[0];
    if (req.user.role === 'employee' && assignment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(assignment);
  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ error: 'Failed to get assignment' });
  }
});

// Assign test to users
router.post('/', authenticate, isTrainingOfficer, [
  body('test_id').isUUID(),
  body('user_ids').isArray({ min: 1 }),
  body('due_date').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { test_id, user_ids, due_date } = req.body;
    
    // Check if test exists and is published
    const testCheck = await db.query('SELECT id, title_ar, title_en FROM tests WHERE id = $1 AND status = $2', [test_id, 'published']);
    if (testCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Test not found or not published' });
    }
    
    const assignments = [];
    const notifications = [];
    
    for (const userId of user_ids) {
      // Check if already assigned
      const existing = await db.query(
        'SELECT id FROM test_assignments WHERE test_id = $1 AND user_id = $2',
        [test_id, userId]
      );
      
      if (existing.rows.length === 0) {
        const result = await db.query(`
          INSERT INTO test_assignments (test_id, user_id, assigned_by, due_date, notification_sent)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
        `, [test_id, userId, req.user.id, due_date]);
        
        assignments.push(result.rows[0]);
        
        // Create notification
        await db.query(`
          INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link, metadata)
          VALUES ($1, 'test_assigned', 'تقييم جديد متاح', 'New Assessment Available',
                  $2, $3, '/assessments', $4)
        `, [
          userId,
          `تم تعيين تقييم جديد لك: ${testCheck.rows[0].title_ar}`,
          `A new assessment has been assigned to you: ${testCheck.rows[0].title_en}`,
          JSON.stringify({ test_id, assignment_id: result.rows[0].id })
        ]);
        
        // Send email notification
        const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          sendTestAssignedEmail(user.email, user.name_ar, {
            title_ar: testCheck.rows[0].title_ar,
            title_en: testCheck.rows[0].title_en,
            due_date: due_date
          }).catch(err => console.error('Failed to send test assigned email:', err));
        }
      }
    }
    
    res.status(201).json({
      message: `Test assigned to ${assignments.length} users`,
      assignments
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Failed to create assignments' });
  }
});

// Assign test to department
router.post('/department', authenticate, isTrainingOfficer, [
  body('test_id').isUUID(),
  body('department_id').isUUID(),
  body('due_date').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { test_id, department_id, due_date } = req.body;
    
    // Get all active employees in department
    const employees = await db.query(
      'SELECT id FROM users WHERE department_id = $1 AND role = $2 AND is_active = true',
      [department_id, 'employee']
    );
    
    if (employees.rows.length === 0) {
      return res.status(400).json({ error: 'No active employees in department' });
    }
    
    const user_ids = employees.rows.map(e => e.id);
    
    // Use the existing assignment logic
    req.body.user_ids = user_ids;
    
    // Forward to main assignment handler
    const testCheck = await db.query('SELECT id, title_ar, title_en FROM tests WHERE id = $1 AND status = $2', [test_id, 'published']);
    if (testCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Test not found or not published' });
    }
    
    const assignments = [];
    
    for (const userId of user_ids) {
      const existing = await db.query(
        'SELECT id FROM test_assignments WHERE test_id = $1 AND user_id = $2',
        [test_id, userId]
      );
      
      if (existing.rows.length === 0) {
        const result = await db.query(`
          INSERT INTO test_assignments (test_id, user_id, assigned_by, due_date, notification_sent)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
        `, [test_id, userId, req.user.id, due_date]);
        
        assignments.push(result.rows[0]);
        
        await db.query(`
          INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
          VALUES ($1, 'test_assigned', 'تقييم جديد متاح', 'New Assessment Available',
                  $2, $3, '/assessments')
        `, [
          userId,
          `تم تعيين تقييم جديد لك: ${testCheck.rows[0].title_ar}`,
          `A new assessment has been assigned to you: ${testCheck.rows[0].title_en}`
        ]);
        
        // Send email notification
        const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          sendTestAssignedEmail(user.email, user.name_ar, {
            title_ar: testCheck.rows[0].title_ar,
            title_en: testCheck.rows[0].title_en,
            due_date: due_date
          }).catch(err => console.error('Failed to send test assigned email:', err));
        }
      }
    }
    
    res.status(201).json({
      message: `Test assigned to ${assignments.length} employees in department`,
      assignments
    });
  } catch (error) {
    console.error('Assign to department error:', error);
    res.status(500).json({ error: 'Failed to assign test to department' });
  }
});

// Assign test to multiple departments (with optional additional users)
router.post('/departments', authenticate, isTrainingOfficer, [
  body('test_id').isUUID(),
  body('department_ids').isArray({ min: 1 }),
  body('user_ids').optional().isArray(),
  body('due_date').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { test_id, department_ids, user_ids = [], due_date } = req.body;
    
    // Check if test exists and is published
    const testCheck = await db.query('SELECT id, title_ar, title_en FROM tests WHERE id = $1 AND status = $2', [test_id, 'published']);
    if (testCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Test not found or not published' });
    }
    
    // Get all active employees from selected departments
    const employeesFromDepts = await db.query(
      `SELECT DISTINCT id FROM users 
       WHERE department_id = ANY($1) AND role = $2 AND is_active = true`,
      [department_ids, 'employee']
    );
    
    // Combine department employees with additional user_ids (unique)
    const deptUserIds = employeesFromDepts.rows.map(e => e.id);
    const allUserIds = [...new Set([...deptUserIds, ...user_ids])];
    
    if (allUserIds.length === 0) {
      return res.status(400).json({ error: 'No active employees found in selected departments' });
    }
    
    const assignments = [];
    
    for (const userId of allUserIds) {
      // Check if already assigned
      const existing = await db.query(
        'SELECT id FROM test_assignments WHERE test_id = $1 AND user_id = $2',
        [test_id, userId]
      );
      
      if (existing.rows.length === 0) {
        const result = await db.query(`
          INSERT INTO test_assignments (test_id, user_id, assigned_by, due_date, notification_sent)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
        `, [test_id, userId, req.user.id, due_date]);
        
        assignments.push(result.rows[0]);
        
        // Create notification
        await db.query(`
          INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link, metadata)
          VALUES ($1, 'test_assigned', 'تقييم جديد متاح', 'New Assessment Available',
                  $2, $3, '/assessments', $4)
        `, [
          userId,
          `تم تعيين تقييم جديد لك: ${testCheck.rows[0].title_ar}`,
          `A new assessment has been assigned to you: ${testCheck.rows[0].title_en}`,
          JSON.stringify({ test_id, assignment_id: result.rows[0].id })
        ]);
        
        // Send email notification
        const userResult = await db.query('SELECT email, name_ar FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          sendTestAssignedEmail(user.email, user.name_ar, {
            title_ar: testCheck.rows[0].title_ar,
            title_en: testCheck.rows[0].title_en,
            due_date: due_date
          }).catch(err => console.error('Failed to send test assigned email:', err));
        }
      }
    }
    
    res.status(201).json({
      message: `Test assigned to ${assignments.length} employees from ${department_ids.length} department(s)`,
      assignments,
      total_departments: department_ids.length,
      total_assigned: assignments.length
    });
  } catch (error) {
    console.error('Assign to departments error:', error);
    res.status(500).json({ error: 'Failed to assign test to departments' });
  }
});

// Start test (employee)
router.post('/:id/start', authenticate, async (req, res) => {
  try {
    // First, check if the assignment exists and belongs to the user
    const existing = await db.query(`
      SELECT * FROM test_assignments
      WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const assignment = existing.rows[0];
    
    // If already in_progress, return success (idempotent behavior)
    if (assignment.status === 'in_progress') {
      return res.json(assignment);
    }
    
    // If already completed, don't allow restart
    if (assignment.status === 'completed') {
      return res.status(400).json({ error: 'Assignment already completed' });
    }
    
    // Start the test (status is 'pending')
    const result = await db.query(`
      UPDATE test_assignments
      SET status = 'in_progress', started_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      RETURNING *
    `, [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Failed to start assignment' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Start test error:', error);
    res.status(500).json({ error: 'Failed to start test' });
  }
});

// Delete assignment
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Check if already completed
    const check = await db.query(
      'SELECT status FROM test_assignments WHERE id = $1',
      [req.params.id]
    );
    
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (check.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Cannot delete completed assignment' });
    }
    
    await db.query('DELETE FROM test_assignments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

module.exports = router;

