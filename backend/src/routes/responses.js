const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { analyzeAssignment } = require('./analysis');

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
             q.weight,
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
      'SELECT question_type, options, likert_labels, self_rating_config FROM questions WHERE id = $1',
      [question_id]
    );
    
    if (question.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    let score = null;
    let isCorrect = null;
    const questionType = question.rows[0].question_type;
    
    // Calculate score based on question type
    if (questionType === 'mcq' && question.rows[0].options) {
      const options = question.rows[0].options;
      const selectedOption = options.find(o => o.value === response_value);
      if (selectedOption) {
        score = selectedOption.score || 0;
        isCorrect = selectedOption.is_correct || false;
      }
    } else if (questionType === 'likert_scale' && response_value) {
      // Likert scale: 1-5, normalize to 0-10 scale for consistency
      const likertValue = parseInt(response_value) || 0;
      if (likertValue >= 1 && likertValue <= 5) {
        // Normalize from 1-5 to 0-10 scale: (value - 1) / 4 * 10
        score = ((likertValue - 1) / 4) * 10;
        isCorrect = likertValue >= 3; // Consider 3+ as acceptable
      }
    } else if (questionType === 'self_rating' && response_value) {
      // Self-rating: already 1-10 scale, use directly
      const ratingValue = parseInt(response_value) || 0;
      if (ratingValue >= 1 && ratingValue <= 10) {
        score = ratingValue;
        isCorrect = ratingValue >= 5; // Consider 5+ as acceptable
      }
    }
    // Open text questions don't have scores
    
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
        'SELECT question_type, options, likert_labels, self_rating_config FROM questions WHERE id = $1',
        [r.question_id]
      );
      
      let score = null;
      let isCorrect = null;
      const questionType = question.rows[0]?.question_type;
      
      // Calculate score based on question type
      if (questionType === 'mcq' && question.rows[0]?.options) {
        const options = question.rows[0].options;
        const selectedOption = options.find(o => o.value === r.response_value);
        if (selectedOption) {
          score = selectedOption.score || 0;
          isCorrect = selectedOption.is_correct || false;
        }
      } else if (questionType === 'likert_scale' && r.response_value) {
        // Likert scale: 1-5, normalize to 0-10 scale for consistency
        const likertValue = parseInt(r.response_value) || 0;
        if (likertValue >= 1 && likertValue <= 5) {
          // Normalize from 1-5 to 0-10 scale: (value - 1) / 4 * 10
          score = ((likertValue - 1) / 4) * 10;
          isCorrect = likertValue >= 3; // Consider 3+ as acceptable
        }
      } else if (questionType === 'self_rating' && r.response_value) {
        // Self-rating: already 1-10 scale, use directly
        const ratingValue = parseInt(r.response_value) || 0;
        if (ratingValue >= 1 && ratingValue <= 10) {
          score = ratingValue;
          isCorrect = ratingValue >= 5; // Consider 5+ as acceptable
        }
      }
      // Open text questions don't have scores
      
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
    
    // Calculate overall score from responses with proper normalization
    // Get all responses with their question types and max scores
    const responsesData = await db.query(`
      SELECT 
        r.score,
        r.is_correct,
        q.question_type,
        q.options,
        q.weight
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
    `, [req.params.assignmentId]);
    
    let totalScore = 0;
    let totalMaxScore = 0;
    let totalResponses = 0;
    let correctCount = 0;
    
    for (const response of responsesData.rows) {
      if (response.score !== null) {
        let maxScore = 10; // Default max score
        
        // Determine max score based on question type
        if (response.question_type === 'mcq' && response.options && Array.isArray(response.options) && response.options.length > 0) {
          // For MCQ, max score is the highest option score
          const optionScores = response.options.map(o => parseFloat(o.score) || 0);
          maxScore = Math.max(...optionScores, 10);
        } else if (response.question_type === 'likert_scale') {
          // Likert scale: 1-5, normalized to 0-10, so max is 10
          maxScore = 10;
        } else if (response.question_type === 'self_rating') {
          // Self-rating: 1-10, so max is 10
          maxScore = 10;
        }
        
        const weight = response.weight || 1;
        totalScore += (response.score || 0) * weight;
        totalMaxScore += maxScore * weight;
        totalResponses++;
        
        if (response.is_correct) {
          correctCount++;
        }
      }
    }
    
    // Calculate overall percentage score
    const overallPercentage = totalMaxScore > 0 
      ? Math.round((totalScore / totalMaxScore) * 100) 
      : 0;
    
    const avgScore = totalResponses > 0 
      ? Math.round((totalScore / totalResponses) * 10) / 10 
      : 0;
    
    // Automatically trigger analysis in the background
    analyzeAssignment(req.params.assignmentId)
      .then((result) => {
        if (result.already_analyzed) {
          console.log(`Assignment ${req.params.assignmentId} already analyzed`);
        } else {
          console.log(`Analysis completed for assignment ${req.params.assignmentId}`);
        }
      })
      .catch((error) => {
        console.error(`Failed to analyze assignment ${req.params.assignmentId}:`, error);
        // Don't fail the submission if analysis fails
      });
    
    // Get detailed question breakdown with weights
    const questionBreakdown = await db.query(`
      SELECT 
        q.id,
        q.question_ar,
        q.question_type,
        q.weight,
        q.options,
        r.score,
        r.is_correct
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assignment_id = $1
      ORDER BY q.order_index
    `, [req.params.assignmentId]);
    
    const weightedBreakdown = questionBreakdown.rows.map(q => {
      const weight = q.weight || 1;
      let maxScore = 10;
      
      if (q.question_type === 'mcq' && q.options && Array.isArray(q.options) && q.options.length > 0) {
        const optionScores = q.options.map(o => parseFloat(o.score) || 0);
        maxScore = Math.max(...optionScores, 10);
      }
      
      const rawScore = q.score || 0;
      const weightedScore = rawScore * weight;
      const weightedMaxScore = maxScore * weight;
      
      return {
        question_id: q.id,
        question_text: q.question_ar,
        question_type: q.question_type,
        weight: weight,
        raw_score: rawScore,
        max_score: maxScore,
        weighted_score: Math.round(weightedScore * 10) / 10,
        weighted_max_score: Math.round(weightedMaxScore * 10) / 10,
        is_correct: q.is_correct
      };
    });
    
    res.json({
      message: 'Test submitted successfully',
      score: {
        overall_percentage: overallPercentage,
        avg_score: avgScore,
        total_responses: totalResponses,
        correct_count: correctCount,
        total_score: Math.round(totalScore * 10) / 10,
        max_score: totalMaxScore,
        weighted_breakdown: weightedBreakdown
      },
      assignment_id: req.params.assignmentId
    });
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({ error: 'Failed to submit test' });
  }
});

module.exports = router;

