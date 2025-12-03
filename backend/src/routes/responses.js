const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get responses for an assignment
router.get('/assignment/:assignmentId', authenticate, async (req, res) => {
  try {
    // Verify access
    const assignment = await db.query(
      'SELECT user_id FROM test_assignments WHERE id = $1',
      [req.params.assignmentId]
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (req.user.role === 'employee' && assignment.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await db.query(`
      SELECT r.*,
             q.question_ar,
             q.question_en,
             q.question_type,
             q.options,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [req.params.assignmentId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get responses error:', error);
    res.status(500).json({ error: 'Failed to get responses' });
  }
});

// Save response
router.post('/', authenticate, [
  body('assignment_id').isUUID(),
  body('question_id').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { assignment_id, question_id, response_value, response_data } = req.body;
    
    // Verify assignment belongs to user and is in progress
    const assignment = await db.query(
      'SELECT id, user_id, status FROM test_assignments WHERE id = $1',
      [assignment_id]
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (assignment.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (assignment.rows[0].status !== 'in_progress') {
      return res.status(400).json({ error: 'Test not in progress' });
    }
    
    // Get question to calculate score
    const question = await db.query(
      'SELECT question_type, options FROM questions WHERE id = $1',
      [question_id]
    );
    
    if (question.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    let score = null;
    let isCorrect = null;
    
    // Calculate score for MCQ
    if (question.rows[0].question_type === 'mcq' && question.rows[0].options) {
      const options = question.rows[0].options;
      const selectedOption = options.find(o => o.value === response_value);
      if (selectedOption) {
        score = selectedOption.score || 0;
        isCorrect = selectedOption.is_correct || false;
      }
    }
    
    // Upsert response
    const result = await db.query(`
      INSERT INTO responses (assignment_id, question_id, response_value, response_data, score, is_correct)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (assignment_id, question_id)
      DO UPDATE SET response_value = $3, response_data = $4, score = $5, is_correct = $6, answered_at = NOW()
      RETURNING *
    `, [assignment_id, question_id, response_value, response_data ? JSON.stringify(response_data) : null, score, isCorrect]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Save response error:', error);
    res.status(500).json({ error: 'Failed to save response' });
  }
});

// Save all responses (bulk)
router.post('/bulk', authenticate, [
  body('assignment_id').isUUID(),
  body('responses').isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { assignment_id, responses } = req.body;
    
    // Verify assignment belongs to user
    const assignment = await db.query(
      'SELECT id, user_id, status FROM test_assignments WHERE id = $1',
      [assignment_id]
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (assignment.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const savedResponses = [];
    
    for (const r of responses) {
      const question = await db.query(
        'SELECT question_type, options FROM questions WHERE id = $1',
        [r.question_id]
      );
      
      let score = null;
      let isCorrect = null;
      
      if (question.rows[0]?.question_type === 'mcq' && question.rows[0]?.options) {
        const options = question.rows[0].options;
        const selectedOption = options.find(o => o.value === r.response_value);
        if (selectedOption) {
          score = selectedOption.score || 0;
          isCorrect = selectedOption.is_correct || false;
        }
      }
      
      const result = await db.query(`
        INSERT INTO responses (assignment_id, question_id, response_value, response_data, score, is_correct)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (assignment_id, question_id)
        DO UPDATE SET response_value = $3, response_data = $4, score = $5, is_correct = $6, answered_at = NOW()
        RETURNING *
      `, [assignment_id, r.question_id, r.response_value, r.response_data ? JSON.stringify(r.response_data) : null, score, isCorrect]);
      
      savedResponses.push(result.rows[0]);
    }
    
    res.json(savedResponses);
  } catch (error) {
    console.error('Bulk save responses error:', error);
    res.status(500).json({ error: 'Failed to save responses' });
  }
});

// Submit test (complete)
router.post('/submit/:assignmentId', authenticate, async (req, res) => {
  try {
    const { time_spent_seconds } = req.body;
    
    // Verify assignment belongs to user
    const assignment = await db.query(
      'SELECT ta.*, t.id as test_id FROM test_assignments ta JOIN tests t ON ta.test_id = t.id WHERE ta.id = $1',
      [req.params.assignmentId]
    );
    
    if (assignment.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    if (assignment.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (assignment.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Test already submitted' });
    }
    
    // Update assignment status
    await db.query(`
      UPDATE test_assignments
      SET status = 'completed', completed_at = NOW(), time_spent_seconds = $1
      WHERE id = $2
    `, [time_spent_seconds, req.params.assignmentId]);
    
    // Calculate overall score from responses
    const scores = await db.query(`
      SELECT 
        COALESCE(AVG(r.score), 0) as avg_score,
        COUNT(*) as total_responses,
        SUM(CASE WHEN r.is_correct THEN 1 ELSE 0 END) as correct_count
      FROM responses r
      WHERE r.assignment_id = $1
    `, [req.params.assignmentId]);
    
    res.json({
      message: 'Test submitted successfully',
      score: scores.rows[0],
      assignment_id: req.params.assignmentId
    });
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({ error: 'Failed to submit test' });
  }
});

module.exports = router;

