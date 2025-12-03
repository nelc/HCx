const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get questions for a test
router.get('/test/:testId', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT q.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM questions q
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE q.test_id = $1
      ORDER BY q.order_index
    `, [req.params.testId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

// Get single question
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT q.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en
      FROM questions q
      LEFT JOIN skills s ON q.skill_id = s.id
      WHERE q.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

// Create question
router.post('/', authenticate, isTrainingOfficer, [
  body('test_id').isUUID(),
  body('question_type').isIn(['mcq', 'open_text', 'likert_scale', 'self_rating']),
  body('question_ar').notEmpty(),
  body('question_en').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { 
      test_id, skill_id, question_type, question_ar, question_en,
      options, likert_labels, self_rating_config, required, weight, order_index
    } = req.body;
    
    // Get next order index if not provided
    let finalOrderIndex = order_index;
    if (finalOrderIndex === undefined) {
      const maxOrder = await db.query(
        'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM questions WHERE test_id = $1',
        [test_id]
      );
      finalOrderIndex = maxOrder.rows[0].next_order;
    }
    
    // Set default Likert labels if not provided
    let finalLikertLabels = likert_labels;
    if (question_type === 'likert_scale' && !likert_labels) {
      finalLikertLabels = {
        min_label_ar: 'لا أوافق بشدة',
        min_label_en: 'Strongly Disagree',
        max_label_ar: 'أوافق بشدة',
        max_label_en: 'Strongly Agree',
        scale: 5
      };
    }
    
    // Set default self-rating config if not provided
    let finalSelfRatingConfig = self_rating_config;
    if (question_type === 'self_rating' && !self_rating_config) {
      finalSelfRatingConfig = {
        min: 1,
        max: 10,
        labels: [
          { value: 1, ar: 'مبتدئ', en: 'Beginner' },
          { value: 5, ar: 'متوسط', en: 'Intermediate' },
          { value: 10, ar: 'خبير', en: 'Expert' }
        ]
      };
    }
    
    const result = await db.query(`
      INSERT INTO questions (
        test_id, skill_id, question_type, question_ar, question_en,
        options, likert_labels, self_rating_config, required, weight, order_index
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      test_id, skill_id, question_type, question_ar, question_en,
      options ? JSON.stringify(options) : null,
      finalLikertLabels ? JSON.stringify(finalLikertLabels) : null,
      finalSelfRatingConfig ? JSON.stringify(finalSelfRatingConfig) : null,
      required !== false, weight || 1.0, finalOrderIndex
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Create multiple questions (bulk)
router.post('/bulk', authenticate, isTrainingOfficer, [
  body('test_id').isUUID(),
  body('questions').isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { test_id, questions } = req.body;
    const createdQuestions = [];
    
    // Get current max order
    const maxOrder = await db.query(
      'SELECT COALESCE(MAX(order_index), 0) as max_order FROM questions WHERE test_id = $1',
      [test_id]
    );
    let orderIndex = maxOrder.rows[0].max_order;
    
    for (const q of questions) {
      orderIndex++;
      
      let likertLabels = q.likert_labels;
      if (q.question_type === 'likert_scale' && !likertLabels) {
        likertLabels = {
          min_label_ar: 'لا أوافق بشدة',
          min_label_en: 'Strongly Disagree',
          max_label_ar: 'أوافق بشدة',
          max_label_en: 'Strongly Agree',
          scale: 5
        };
      }
      
      let selfRatingConfig = q.self_rating_config;
      if (q.question_type === 'self_rating' && !selfRatingConfig) {
        selfRatingConfig = {
          min: 1, max: 10,
          labels: [
            { value: 1, ar: 'مبتدئ', en: 'Beginner' },
            { value: 5, ar: 'متوسط', en: 'Intermediate' },
            { value: 10, ar: 'خبير', en: 'Expert' }
          ]
        };
      }
      
      const result = await db.query(`
        INSERT INTO questions (
          test_id, skill_id, question_type, question_ar, question_en,
          options, likert_labels, self_rating_config, required, weight, order_index
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        test_id, q.skill_id, q.question_type, q.question_ar, q.question_en,
        q.options ? JSON.stringify(q.options) : null,
        likertLabels ? JSON.stringify(likertLabels) : null,
        selfRatingConfig ? JSON.stringify(selfRatingConfig) : null,
        q.required !== false, q.weight || 1.0, orderIndex
      ]);
      
      createdQuestions.push(result.rows[0]);
    }
    
    res.status(201).json(createdQuestions);
  } catch (error) {
    console.error('Bulk create questions error:', error);
    res.status(500).json({ error: 'Failed to create questions' });
  }
});

// Update question
router.put('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { 
      skill_id, question_type, question_ar, question_en,
      options, likert_labels, self_rating_config, required, weight, order_index
    } = req.body;
    
    const result = await db.query(`
      UPDATE questions
      SET skill_id = COALESCE($1, skill_id),
          question_type = COALESCE($2, question_type),
          question_ar = COALESCE($3, question_ar),
          question_en = COALESCE($4, question_en),
          options = COALESCE($5, options),
          likert_labels = COALESCE($6, likert_labels),
          self_rating_config = COALESCE($7, self_rating_config),
          required = COALESCE($8, required),
          weight = COALESCE($9, weight),
          order_index = COALESCE($10, order_index)
      WHERE id = $11
      RETURNING *
    `, [
      skill_id, question_type, question_ar, question_en,
      options ? JSON.stringify(options) : null,
      likert_labels ? JSON.stringify(likert_labels) : null,
      self_rating_config ? JSON.stringify(self_rating_config) : null,
      required, weight, order_index, req.params.id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Reorder questions
router.post('/reorder', authenticate, isTrainingOfficer, [
  body('questions').isArray()
], async (req, res) => {
  try {
    const { questions } = req.body; // Array of { id, order_index }
    
    for (const q of questions) {
      await db.query(
        'UPDATE questions SET order_index = $1 WHERE id = $2',
        [q.order_index, q.id]
      );
    }
    
    res.json({ message: 'Questions reordered successfully' });
  } catch (error) {
    console.error('Reorder questions error:', error);
    res.status(500).json({ error: 'Failed to reorder questions' });
  }
});

// Delete question
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM questions WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

module.exports = router;

