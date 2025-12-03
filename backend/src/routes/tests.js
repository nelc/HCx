const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isTrainingOfficer, isEmployee } = require('../middleware/auth');

const router = express.Router();

// Get all tests
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { domain_id, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT t.*,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             u.name_ar as created_by_name_ar,
             u.name_en as created_by_name_en,
             (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as questions_count,
             (SELECT COUNT(*) FROM test_assignments WHERE test_id = t.id) as assignments_count,
             (SELECT COUNT(*) FROM test_assignments WHERE test_id = t.id AND status = 'completed') as completed_count
      FROM tests t
      LEFT JOIN training_domains td ON t.domain_id = td.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (domain_id) {
      paramCount++;
      query += ` AND t.domain_id = $${paramCount}`;
      params.push(domain_id);
    }
    
    if (status) {
      paramCount++;
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json({
      tests: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({ error: 'Failed to get tests' });
  }
});

// Get single test with questions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const testResult = await db.query(`
      SELECT t.*,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color,
             u.name_ar as created_by_name_ar,
             u.name_en as created_by_name_en
      FROM tests t
      LEFT JOIN training_domains td ON t.domain_id = td.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = $1
    `, [req.params.id]);
    
    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    const questionsResult = await db.query(`
      SELECT q.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM questions q
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE q.test_id = $1
      ORDER BY q.order_index
    `, [req.params.id]);
    
    res.json({
      ...testResult.rows[0],
      questions: questionsResult.rows
    });
  } catch (error) {
    console.error('Get test error:', error);
    res.status(500).json({ error: 'Failed to get test' });
  }
});

// Create test
router.post('/', authenticate, isTrainingOfficer, [
  body('domain_id').isUUID(),
  body('title_ar').notEmpty(),
  body('title_en').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { 
      domain_id, title_ar, title_en, description_ar, description_en,
      instructions_ar, instructions_en, duration_minutes, passing_score,
      is_timed, is_randomized, show_results_immediately, confidentiality_level,
      start_date, end_date
    } = req.body;
    
    const result = await db.query(`
      INSERT INTO tests (
        domain_id, title_ar, title_en, description_ar, description_en,
        instructions_ar, instructions_en, duration_minutes, passing_score,
        is_timed, is_randomized, show_results_immediately, confidentiality_level,
        start_date, end_date, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      domain_id, title_ar, title_en, description_ar, description_en,
      instructions_ar, instructions_en, duration_minutes, passing_score,
      is_timed || false, is_randomized || false, show_results_immediately !== false, 
      confidentiality_level || 'standard', start_date, end_date, req.user.id
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create test error:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
});

// Update test
router.put('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { 
      title_ar, title_en, description_ar, description_en,
      instructions_ar, instructions_en, duration_minutes, passing_score,
      is_timed, is_randomized, show_results_immediately, confidentiality_level,
      start_date, end_date, status
    } = req.body;
    
    const result = await db.query(`
      UPDATE tests
      SET title_ar = COALESCE($1, title_ar),
          title_en = COALESCE($2, title_en),
          description_ar = COALESCE($3, description_ar),
          description_en = COALESCE($4, description_en),
          instructions_ar = COALESCE($5, instructions_ar),
          instructions_en = COALESCE($6, instructions_en),
          duration_minutes = COALESCE($7, duration_minutes),
          passing_score = COALESCE($8, passing_score),
          is_timed = COALESCE($9, is_timed),
          is_randomized = COALESCE($10, is_randomized),
          show_results_immediately = COALESCE($11, show_results_immediately),
          confidentiality_level = COALESCE($12, confidentiality_level),
          start_date = COALESCE($13, start_date),
          end_date = COALESCE($14, end_date),
          status = COALESCE($15, status)
      WHERE id = $16
      RETURNING *
    `, [
      title_ar, title_en, description_ar, description_en,
      instructions_ar, instructions_en, duration_minutes, passing_score,
      is_timed, is_randomized, show_results_immediately, confidentiality_level,
      start_date, end_date, status, req.params.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update test error:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
});

// Publish test
router.post('/:id/publish', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Check if test has questions
    const questionCheck = await db.query('SELECT id FROM questions WHERE test_id = $1 LIMIT 1', [req.params.id]);
    if (questionCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Cannot publish test without questions' });
    }
    
    const result = await db.query(`
      UPDATE tests SET status = 'published' WHERE id = $1 AND status = 'draft' RETURNING *
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Test not found or already published' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Publish test error:', error);
    res.status(500).json({ error: 'Failed to publish test' });
  }
});

// Close test
router.post('/:id/close', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE tests SET status = 'closed' WHERE id = $1 RETURNING *
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Close test error:', error);
    res.status(500).json({ error: 'Failed to close test' });
  }
});

// Delete test
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    // Check if test has completed assignments
    const completedCheck = await db.query(
      'SELECT id FROM test_assignments WHERE test_id = $1 AND status = $2 LIMIT 1', 
      [req.params.id, 'completed']
    );
    if (completedCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete test with completed assignments' });
    }
    
    const result = await db.query('DELETE FROM tests WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Delete test error:', error);
    res.status(500).json({ error: 'Failed to delete test' });
  }
});

// Duplicate test
router.post('/:id/duplicate', authenticate, isTrainingOfficer, async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get original test
    const testResult = await client.query('SELECT * FROM tests WHERE id = $1', [req.params.id]);
    if (testResult.rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    const original = testResult.rows[0];
    
    // Create duplicate test
    const newTest = await client.query(`
      INSERT INTO tests (
        domain_id, title_ar, title_en, description_ar, description_en,
        instructions_ar, instructions_en, duration_minutes, passing_score,
        is_timed, is_randomized, show_results_immediately, confidentiality_level,
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14)
      RETURNING *
    `, [
      original.domain_id, 
      original.title_ar + ' (نسخة)', 
      original.title_en + ' (Copy)',
      original.description_ar, original.description_en,
      original.instructions_ar, original.instructions_en,
      original.duration_minutes, original.passing_score,
      original.is_timed, original.is_randomized, original.show_results_immediately,
      original.confidentiality_level, req.user.id
    ]);
    
    // Copy questions
    const questions = await client.query('SELECT * FROM questions WHERE test_id = $1', [req.params.id]);
    for (const q of questions.rows) {
      await client.query(`
        INSERT INTO questions (test_id, skill_id, question_type, question_ar, question_en, 
                              options, likert_labels, self_rating_config, required, weight, order_index)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        newTest.rows[0].id, q.skill_id, q.question_type, q.question_ar, q.question_en,
        q.options, q.likert_labels, q.self_rating_config, q.required, q.weight, q.order_index
      ]);
    }
    
    await client.query('COMMIT');
    res.status(201).json(newTest.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Duplicate test error:', error);
    res.status(500).json({ error: 'Failed to duplicate test' });
  } finally {
    client.release();
  }
});

module.exports = router;

