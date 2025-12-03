const express = require('express');
const db = require('../db');
const { authenticate, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all recommendations (for training officer)
router.get('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { user_id, skill_id, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT tr.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             u.email as user_email,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             d.name_ar as department_name_ar,
             d.name_en as department_name_en
      FROM training_recommendations tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (user_id) {
      paramCount++;
      query += ` AND tr.user_id = $${paramCount}`;
      params.push(user_id);
    }
    
    if (skill_id) {
      paramCount++;
      query += ` AND tr.skill_id = $${paramCount}`;
      params.push(skill_id);
    }
    
    if (status) {
      paramCount++;
      query += ` AND tr.status = $${paramCount}`;
      params.push(status);
    }
    
    query += ` ORDER BY tr.priority, tr.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json({
      recommendations: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get my recommendations (for employee)
router.get('/my', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT tr.*,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color
      FROM training_recommendations tr
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE tr.user_id = $1
    `;
    const params = [req.user.id];
    
    if (status) {
      query += ' AND tr.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY tr.priority, tr.created_at DESC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get my recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get single recommendation
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT tr.*,
             u.name_ar as user_name_ar,
             u.name_en as user_name_en,
             s.name_ar as skill_name_ar,
             s.name_en as skill_name_en,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM training_recommendations tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN skills s ON tr.skill_id = s.id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      WHERE tr.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    // Check authorization
    if (req.user.role === 'employee' && result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get recommendation error:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

// Update recommendation status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['recommended', 'enrolled', 'in_progress', 'completed', 'skipped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Verify ownership for employees
    if (req.user.role === 'employee') {
      const check = await db.query('SELECT user_id FROM training_recommendations WHERE id = $1', [req.params.id]);
      if (check.rows.length === 0 || check.rows[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const result = await db.query(`
      UPDATE training_recommendations
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update recommendation status error:', error);
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

// Add manual recommendation (training officer)
router.post('/', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const {
      user_id, skill_id, course_title_ar, course_title_en,
      course_description_ar, course_description_en, course_url,
      provider, duration_hours, difficulty_level, priority
    } = req.body;
    
    const result = await db.query(`
      INSERT INTO training_recommendations (
        user_id, skill_id, course_title_ar, course_title_en,
        course_description_ar, course_description_en, course_url,
        provider, duration_hours, difficulty_level, priority, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual')
      RETURNING *
    `, [
      user_id, skill_id, course_title_ar, course_title_en,
      course_description_ar, course_description_en, course_url,
      provider, duration_hours, difficulty_level, priority || 1
    ]);
    
    // Create notification for employee
    await db.query(`
      INSERT INTO notifications (user_id, type, title_ar, title_en, message_ar, message_en, link)
      VALUES ($1, 'recommendation_new', 'توصية تدريبية جديدة', 'New Training Recommendation',
              $2, $3, '/my-recommendations')
    `, [
      user_id,
      `تمت إضافة توصية تدريبية جديدة: ${course_title_ar}`,
      `A new training recommendation has been added: ${course_title_en}`
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create recommendation error:', error);
    res.status(500).json({ error: 'Failed to create recommendation' });
  }
});

// Delete recommendation
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM training_recommendations WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    res.json({ message: 'Recommendation deleted successfully' });
  } catch (error) {
    console.error('Delete recommendation error:', error);
    res.status(500).json({ error: 'Failed to delete recommendation' });
  }
});

// Get recommendations summary by skill
router.get('/summary/by-skill', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.id as skill_id,
        s.name_ar as skill_name_ar,
        s.name_en as skill_name_en,
        td.name_ar as domain_name_ar,
        td.name_en as domain_name_en,
        COUNT(tr.id) as total_recommendations,
        COUNT(CASE WHEN tr.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN tr.status = 'in_progress' THEN 1 END) as in_progress_count
      FROM skills s
      LEFT JOIN training_recommendations tr ON s.id = tr.skill_id
      LEFT JOIN training_domains td ON s.domain_id = td.id
      GROUP BY s.id, s.name_ar, s.name_en, td.name_ar, td.name_en
      HAVING COUNT(tr.id) > 0
      ORDER BY total_recommendations DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get recommendations summary error:', error);
    res.status(500).json({ error: 'Failed to get recommendations summary' });
  }
});

module.exports = router;

