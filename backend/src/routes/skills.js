const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, isAdmin, isTrainingOfficer } = require('../middleware/auth');

const router = express.Router();

// Get all skills
router.get('/', authenticate, async (req, res) => {
  try {
    const { domain_id } = req.query;
    
    let query = `
      SELECT s.*,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en,
             td.color as domain_color
      FROM skills s
      JOIN training_domains td ON s.domain_id = td.id
    `;
    const params = [];
    
    if (domain_id) {
      query += ' WHERE s.domain_id = $1';
      params.push(domain_id);
    }
    
    query += ' ORDER BY td.name_ar, s.name_ar';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({ error: 'Failed to get skills' });
  }
});

// Get single skill
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*,
             td.name_ar as domain_name_ar,
             td.name_en as domain_name_en
      FROM skills s
      JOIN training_domains td ON s.domain_id = td.id
      WHERE s.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get skill error:', error);
    res.status(500).json({ error: 'Failed to get skill' });
  }
});

// Create skill
router.post('/', authenticate, isTrainingOfficer, [
  body('domain_id').isUUID(),
  body('name_ar').notEmpty(),
  body('name_en').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { domain_id, name_ar, name_en, description_ar, description_en, weight } = req.body;
    
    const result = await db.query(`
      INSERT INTO skills (domain_id, name_ar, name_en, description_ar, description_en, weight)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [domain_id, name_ar, name_en, description_ar, description_en, weight || 1.0]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create skill error:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// Create multiple skills (bulk)
router.post('/bulk', authenticate, isTrainingOfficer, [
  body('domain_id').isUUID(),
  body('skills').isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { domain_id, skills } = req.body;
    const createdSkills = [];
    
    for (const skill of skills) {
      const result = await db.query(`
        INSERT INTO skills (domain_id, name_ar, name_en, description_ar, description_en, weight)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [domain_id, skill.name_ar, skill.name_en, skill.description_ar, skill.description_en, skill.weight || 1.0]);
      createdSkills.push(result.rows[0]);
    }
    
    res.status(201).json(createdSkills);
  } catch (error) {
    console.error('Bulk create skills error:', error);
    res.status(500).json({ error: 'Failed to create skills' });
  }
});

// Update skill
router.put('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, description_en, weight } = req.body;
    
    const result = await db.query(`
      UPDATE skills
      SET name_ar = COALESCE($1, name_ar),
          name_en = COALESCE($2, name_en),
          description_ar = COALESCE($3, description_ar),
          description_en = COALESCE($4, description_en),
          weight = COALESCE($5, weight)
      WHERE id = $6
      RETURNING *
    `, [name_ar, name_en, description_ar, description_en, weight, req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update skill error:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// Delete skill
router.delete('/:id', authenticate, isTrainingOfficer, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM skills WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Delete skill error:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

module.exports = router;

